"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LessonRow } from "./lesson-row";
import type { SectionWithLessons } from "@/types/database";

export function SectionCard({
  section,
  onRename,
  onDelete,
  onAddLesson,
  onEditLesson,
  onDeleteLesson,
  onReorderLessons,
}: {
  section: SectionWithLessons;
  onRename: (title: string) => void;
  onDelete: () => void;
  onAddLesson: () => void;
  onEditLesson: (lessonId: string) => void;
  onDeleteLesson: (lessonId: string) => void;
  onReorderLessons: (orderedLessonIds: string[]) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `section:${section.id}`,
  });
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(section.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleLessonDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = section.lessons.map((l) => `lesson:${l.id}`);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    const reordered = arrayMove(ids, oldIndex, newIndex).map((id) => id.replace("lesson:", ""));
    onReorderLessons(reordered);
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-xl border border-ink-100 bg-white ${isDragging ? "z-10 shadow-card" : ""}`}
    >
      <div className="flex items-center gap-2 border-b border-ink-100 px-3 py-2.5">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-ink-300 hover:text-ink-500 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {editingTitle ? (
          <>
            <Input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              className="h-8 flex-1"
              autoFocus
            />
            <button
              onClick={() => {
                onRename(titleDraft);
                setEditingTitle(false);
              }}
              className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                setTitleDraft(section.title);
                setEditingTitle(false);
              }}
              className="rounded p-1.5 text-ink-400 hover:bg-ink-100"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <h3 className="flex-1 text-sm font-semibold text-ink-900">{section.title}</h3>
            <button onClick={() => setEditingTitle(true)} className="rounded p-1.5 text-ink-400 hover:bg-ink-100">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {confirmingDelete ? (
              <>
                <span className="text-xs text-ink-500">Delete section?</span>
                <button onClick={onDelete} className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white">
                  Confirm
                </button>
                <button onClick={() => setConfirmingDelete(false)} className="rounded p-1.5 text-ink-400 hover:bg-ink-100">
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <button onClick={() => setConfirmingDelete(true)} className="rounded p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}
      </div>

      <div className="p-2">
        {section.lessons.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleLessonDragEnd}>
            <SortableContext items={section.lessons.map((l) => `lesson:${l.id}`)} strategy={verticalListSortingStrategy}>
              <div className="space-y-0.5">
                {section.lessons.map((lesson) => (
                  <LessonRow
                    key={lesson.id}
                    lesson={lesson}
                    onEdit={() => onEditLesson(lesson.id)}
                    onDelete={() => onDeleteLesson(lesson.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <Button variant="ghost" size="sm" className="mt-1 w-full justify-start text-ink-500" onClick={onAddLesson}>
          <Plus className="h-3.5 w-3.5" /> Add Lesson
        </Button>
      </div>
    </div>
  );
}
