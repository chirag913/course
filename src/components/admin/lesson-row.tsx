"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, PlayCircle, FileText, Folder, Layers, Eye, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LessonWithResources } from "@/types/database";

const typeIcons = { video: PlayCircle, text: FileText, resource: Folder, mixed: Layers };

export function LessonRow({
  lesson,
  onEdit,
  onDelete,
}: {
  lesson: LessonWithResources;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `lesson:${lesson.id}`,
  });

  const Icon = typeIcons[lesson.lesson_type];

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-md border border-transparent px-2 py-2 hover:border-ink-300 hover:bg-ink-200",
        isDragging && "z-10 border-ink-400 bg-ink-200"
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-ink-500 hover:text-ink-800 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Icon className="h-4 w-4 shrink-0 text-ink-500" />
      <button onClick={onEdit} className="min-w-0 flex-1 truncate text-left text-sm text-ink-800 hover:text-brand-300">
        {lesson.title}
      </button>
      {lesson.is_free_preview && (
        <span className="flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
          <Eye className="h-3 w-3" /> Preview
        </span>
      )}
      {!lesson.is_published && (
        <span className="rounded-full border border-ink-400 px-2 py-0.5 text-xs font-medium text-ink-500">Hidden</span>
      )}
      <button onClick={onDelete} className="rounded p-1 text-ink-500 hover:bg-danger/10 hover:text-danger">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
