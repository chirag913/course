"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Layers } from "lucide-react";
import { SectionCard } from "./section-card";
import { LessonEditorDrawer } from "./lesson-editor-drawer";
import {
  createSection,
  updateSection,
  deleteSection,
  reorderSections,
  deleteLesson,
  reorderLessons,
} from "@/app/admin/courses/[courseId]/actions";
import type { SectionWithLessons } from "@/types/database";

export function CurriculumEditor({
  courseId,
  sections: sectionsProp,
}: {
  courseId: string;
  sections: SectionWithLessons[];
}) {
  const router = useRouter();
  const [sections, setSections] = useState(sectionsProp);
  const [, startTransition] = useTransition();
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [addingSectionOpen, setAddingSectionOpen] = useState(false);
  const [drawer, setDrawer] = useState<{ sectionId: string; lessonId: string | null } | null>(null);

  useEffect(() => setSections(sectionsProp), [sectionsProp]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = sections.map((s) => `section:${s.id}`);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    const reordered = arrayMove(sections, oldIndex, newIndex);
    setSections(reordered);
    startTransition(() => reorderSections(courseId, reordered.map((s) => s.id)));
  }

  async function handleAddSection() {
    if (!newSectionTitle.trim()) return;
    await createSection(courseId, newSectionTitle.trim());
    setNewSectionTitle("");
    setAddingSectionOpen(false);
    router.refresh();
  }

  const activeSection = drawer ? sections.find((s) => s.id === drawer.sectionId) ?? null : null;
  const activeLesson =
    activeSection && drawer?.lessonId
      ? activeSection.lessons.find((l) => l.id === drawer.lessonId) ?? null
      : null;

  return (
    <div>
      {sections.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No sections yet"
          description="Start by adding your first section, like “Getting Started.”"
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
          <SortableContext items={sections.map((s) => `section:${s.id}`)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {sections.map((section) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  onRename={(title) => {
                    setSections((prev) => prev.map((s) => (s.id === section.id ? { ...s, title } : s)));
                    startTransition(() => updateSection(courseId, section.id, title));
                  }}
                  onDelete={() => {
                    setSections((prev) => prev.filter((s) => s.id !== section.id));
                    startTransition(async () => {
                      await deleteSection(courseId, section.id);
                      router.refresh();
                    });
                  }}
                  onAddLesson={() => setDrawer({ sectionId: section.id, lessonId: null })}
                  onEditLesson={(lessonId) => setDrawer({ sectionId: section.id, lessonId })}
                  onDeleteLesson={(lessonId) => {
                    setSections((prev) =>
                      prev.map((s) =>
                        s.id === section.id ? { ...s, lessons: s.lessons.filter((l) => l.id !== lessonId) } : s
                      )
                    );
                    startTransition(async () => {
                      await deleteLesson(courseId, lessonId);
                      router.refresh();
                    });
                  }}
                  onReorderLessons={(orderedIds) => {
                    setSections((prev) =>
                      prev.map((s) =>
                        s.id === section.id
                          ? {
                              ...s,
                              lessons: orderedIds.map((id) => s.lessons.find((l) => l.id === id)!),
                            }
                          : s
                      )
                    );
                    startTransition(() => reorderLessons(courseId, orderedIds));
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {addingSectionOpen ? (
        <div className="mt-4 flex gap-2">
          <Input
            autoFocus
            placeholder="Section title"
            value={newSectionTitle}
            onChange={(e) => setNewSectionTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddSection()}
          />
          <Button onClick={handleAddSection}>Add</Button>
          <Button variant="ghost" onClick={() => setAddingSectionOpen(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="outline" className="mt-4" onClick={() => setAddingSectionOpen(true)}>
          <Plus className="h-4 w-4" /> Add Section
        </Button>
      )}

      {drawer && activeSection && (
        <LessonEditorDrawer
          courseId={courseId}
          sectionId={activeSection.id}
          lesson={activeLesson}
          onClose={() => setDrawer(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
