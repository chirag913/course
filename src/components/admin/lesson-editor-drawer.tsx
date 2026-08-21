"use client";

import { useState, useTransition } from "react";
import { X, FileDown, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, FieldError } from "@/components/ui/input";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { createClient } from "@/lib/supabase/client";
import {
  createLesson,
  updateLesson,
  deleteLesson,
  addResource,
  deleteResource,
  type LessonFormInput,
} from "@/app/admin/courses/[courseId]/actions";
import type { LessonType, LessonWithResources } from "@/types/database";

const LESSON_TYPES: { value: LessonType; label: string }[] = [
  { value: "video", label: "Video" },
  { value: "text", label: "Text" },
  { value: "resource", label: "Resource" },
  { value: "mixed", label: "Mixed (video + text + files)" },
];

export function LessonEditorDrawer({
  courseId,
  sectionId,
  lesson,
  onClose,
  onSaved,
}: {
  courseId: string;
  sectionId: string;
  lesson: LessonWithResources | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [current, setCurrent] = useState(lesson);
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [lessonType, setLessonType] = useState<LessonType>(lesson?.lesson_type ?? "video");
  const [videoUrl, setVideoUrl] = useState(lesson?.video_id ?? "");
  const [durationMinutes, setDurationMinutes] = useState(
    lesson ? Math.round(lesson.duration_seconds / 60) : 0
  );
  const [description, setDescription] = useState(lesson?.description ?? "");
  const [content, setContent] = useState(lesson?.content ?? "");
  const [isFreePreview, setIsFreePreview] = useState(lesson?.is_free_preview ?? false);
  const [isPublished, setIsPublished] = useState(lesson?.is_published ?? true);

  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  function buildInput(): LessonFormInput {
    return {
      title,
      lesson_type: lessonType,
      description,
      content,
      video_url: videoUrl,
      duration_seconds: durationMinutes * 60,
      is_free_preview: isFreePreview,
      is_published: isPublished,
    };
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        if (current) {
          await updateLesson(courseId, current.id, buildInput());
          onSaved();
        } else {
          const created = await createLesson(courseId, sectionId, buildInput());
          setCurrent({ ...created, lesson_resources: [] });
          onSaved();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save lesson.");
      }
    });
  }

  function handleDelete() {
    if (!current) return;
    startTransition(async () => {
      await deleteLesson(courseId, current.id);
      onSaved();
      onClose();
    });
  }

  async function handleFileUpload(file: File) {
    if (!current) return;
    setUploadError(null);
    setUploading(true);

    const supabase = createClient();
    const path = `${courseId}/${current.id}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("course-materials").upload(path, file);

    if (uploadErr) {
      setUploading(false);
      setUploadError("Upload failed. Please try again.");
      return;
    }

    try {
      await addResource(courseId, current.id, {
        name: file.name,
        file_path: path,
        file_type: file.type || "application/octet-stream",
        file_size: file.size,
      });
      setCurrent({
        ...current,
        lesson_resources: [
          ...current.lesson_resources,
          {
            id: crypto.randomUUID(),
            lesson_id: current.id,
            name: file.name,
            file_path: path,
            file_type: file.type,
            file_size: file.size,
            description: null,
            created_at: new Date().toISOString(),
          },
        ],
      });
      onSaved();
    } catch {
      setUploadError("Could not attach file.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 className="text-base font-semibold text-ink-900">{current ? "Edit Lesson" : "New Lesson"}</h2>
          <button onClick={onClose} className="rounded p-1 text-ink-400 hover:bg-ink-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 p-5">
          <div>
            <Label htmlFor="lesson_title">Lesson Title</Label>
            <Input id="lesson_title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <Label htmlFor="lesson_type">Lesson Type</Label>
            <select
              id="lesson_type"
              value={lessonType}
              onChange={(e) => setLessonType(e.target.value as LessonType)}
              className="h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            >
              {LESSON_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {(lessonType === "video" || lessonType === "mixed") && (
            <div>
              <Label htmlFor="video_url">YouTube URL (Unlisted)</Label>
              <Input
                id="video_url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
              />
              <p className="mt-1 text-xs text-ink-400">Paste the full unlisted YouTube video URL.</p>
            </div>
          )}

          <div>
            <Label htmlFor="duration">Duration (minutes)</Label>
            <Input
              id="duration"
              type="number"
              min={0}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
            />
          </div>

          <div>
            <Label>Description</Label>
            <RichTextEditor defaultValue={description} onChange={setDescription} placeholder="Explain this lesson..." />
          </div>

          {(lessonType === "text" || lessonType === "mixed") && (
            <div>
              <Label>Lesson Content</Label>
              <RichTextEditor defaultValue={content} onChange={setContent} placeholder="Write the lesson content..." />
            </div>
          )}

          <div className="rounded-xl border border-ink-100 p-4">
            <div className="flex items-center justify-between">
              <Label className="mb-0">Course Materials</Label>
              {current && (
                <label className="cursor-pointer text-xs font-medium text-brand-600 hover:underline">
                  {uploading ? "Uploading..." : "+ Add Material"}
                  <input
                    type="file"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>

            {!current && (
              <p className="mt-2 text-xs text-ink-400">Save the lesson first to attach files.</p>
            )}

            {current && current.lesson_resources.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {current.lesson_resources.map((resource) => (
                  <li key={resource.id} className="flex items-center justify-between rounded-lg bg-ink-50 px-2.5 py-1.5">
                    <span className="flex min-w-0 items-center gap-1.5 text-sm text-ink-700">
                      <FileDown className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                      <span className="truncate">{resource.name}</span>
                    </span>
                    <button
                      onClick={() =>
                        startTransition(async () => {
                          await deleteResource(courseId, resource.id);
                          setCurrent((c) =>
                            c
                              ? { ...c, lesson_resources: c.lesson_resources.filter((r) => r.id !== resource.id) }
                              : c
                          );
                        })
                      }
                      className="rounded p-1 text-ink-300 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {uploadError && <FieldError>{uploadError}</FieldError>}
          </div>

          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={isFreePreview}
              onChange={(e) => setIsFreePreview(e.target.checked)}
              className="h-4 w-4 rounded border-ink-300"
            />
            Free Preview
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="h-4 w-4 rounded border-ink-300"
            />
            Visible to students
          </label>

          {error && <FieldError>{error}</FieldError>}
        </div>

        <div className="flex items-center justify-between border-t border-ink-100 p-5">
          {current ? (
            <Button variant="ghost" onClick={handleDelete} loading={isPending} className="text-red-600">
              <Trash2 className="h-4 w-4" /> Delete Lesson
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={handleSave} loading={isPending} disabled={!title.trim()}>
            <Upload className="h-4 w-4" /> Save Lesson
          </Button>
        </div>
      </div>
    </div>
  );
}
