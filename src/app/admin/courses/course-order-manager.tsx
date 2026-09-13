"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BookOpen, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPrice } from "@/lib/utils";
import { reorderCourses } from "@/app/admin/courses/actions";
import { CourseRowActions } from "@/app/admin/courses/course-row-actions";
import type { Course } from "@/types/database";

function DraggableCourseRow({
  course,
  index,
  studentCount,
}: {
  course: Course;
  index: number;
  studentCount: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: course.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex flex-wrap items-center justify-between gap-4 border-b border-ink-300 py-5 ${isDragging ? "z-10 bg-ink-100" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="cursor-grab touch-none text-ink-500 hover:text-ink-800 active:cursor-grabbing"
          aria-label={`Move ${course.title}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="font-mono text-xs text-ink-500">{String(index + 1).padStart(2, "0")}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-semibold text-ink-900">{course.title}</h3>
            <Badge tone={course.status === "published" ? "success" : "neutral"}>
              {course.status === "published" ? "Published" : "Draft"}
            </Badge>
          </div>
          <p className="mt-1 font-mono text-xs text-ink-500">
            {formatPrice(course.price, course.currency)} · {studentCount} STUDENTS
          </p>
        </div>
      </div>
      <CourseRowActions courseId={course.id} slug={course.slug} status={course.status} />
    </div>
  );
}

export function CourseOrderManager({
  courses,
  studentCounts,
}: {
  courses: Course[];
  studentCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [orderedCourses, setOrderedCourses] = useState(courses);
  const [isPending, startTransition] = useTransition();
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrderedCourses(courses);
    setHasChanges(false);
  }, [courses]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = orderedCourses.map((c) => c.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(orderedCourses, oldIndex, newIndex);
    setOrderedCourses(reordered);
    setHasChanges(true);
  }

  function handleSave() {
    if (!hasChanges) return;
    setError(null);
    startTransition(async () => {
      try {
        await reorderCourses(orderedCourses.map((course) => course.id));
        setHasChanges(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save course order.");
      }
    });
  }

  if (!orderedCourses.length) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No courses yet"
        description="Create your first course to get started."
      />
    );
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-end gap-3">
        {error && <p className="text-xs text-danger">{error}</p>}
        <Button size="sm" onClick={handleSave} loading={isPending} disabled={!hasChanges || isPending}>
          Save order
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={orderedCourses.map((course) => course.id)} strategy={verticalListSortingStrategy}>
          <div className="border-t border-ink-300">
            {orderedCourses.map((course, index) => (
              <DraggableCourseRow
                key={course.id}
                course={course}
                index={index}
                studentCount={studentCounts[course.id] ?? 0}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {hasChanges ? <p className="mt-3 text-xs text-ink-500">Unsaved changes</p> : <p className="mt-3 text-xs text-ink-500">Drag and drop to reorder.</p>}
    </div>
  );
}
