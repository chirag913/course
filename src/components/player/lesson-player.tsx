"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import Link from "next/link";
import { VideoPlayer } from "@/components/video/video-player";
import { Button } from "@/components/ui/button";
import { FileDown, CheckCircle2, ChevronLeft, ChevronRight, PartyPopper } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import type { LessonWithResources } from "@/types/database";

export function LessonPlayer({
  courseSlug,
  lesson,
  prevLessonId,
  nextLessonId,
  initialCompleted,
  initialPositionSeconds,
  wasLastRemainingLesson,
}: {
  courseSlug: string;
  lesson: LessonWithResources;
  prevLessonId: string | null;
  nextLessonId: string | null;
  initialCompleted: boolean;
  initialPositionSeconds: number;
  /** True if completing this lesson finishes the whole course. */
  wasLastRemainingLesson: boolean;
}) {
  const router = useRouter();
  const [completed, setCompleted] = useState(initialCompleted);
  const [saving, setSaving] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  const reportProgress = useCallback(
    (seconds: number) => {
      fetch(`/api/lessons/${lesson.id}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionSeconds: seconds }),
      }).catch(() => {});
    },
    [lesson.id]
  );

  async function toggleComplete() {
    setSaving(true);
    const nextState = !completed;
    const res = await fetch(`/api/lessons/${lesson.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: nextState }),
    });
    setSaving(false);

    if (!res.ok) return;
    setCompleted(nextState);

    if (nextState && wasLastRemainingLesson) {
      setShowCelebration(true);
      router.refresh();
      return;
    }

    if (nextState && nextLessonId) {
      router.push(`/dashboard/learn/${courseSlug}/${nextLessonId}`);
    }
    router.refresh();
  }

  if (showCelebration) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-ink-100 bg-white px-6 py-20 text-center">
        <PartyPopper className="h-10 w-10 text-brand-600" />
        <h2 className="mt-4 text-2xl font-bold text-ink-900">Course Completed 🎉</h2>
        <p className="mt-2 text-ink-500">Great work — you&apos;ve finished every lesson.</p>
        <Link href="/dashboard">
          <Button className="mt-6">Back to My Courses</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
      {(lesson.lesson_type === "video" || lesson.lesson_type === "mixed") && (
        <VideoPlayer
          provider={lesson.video_provider ?? "youtube"}
          videoId={lesson.video_id}
          title={lesson.title}
          startSeconds={initialPositionSeconds}
          onProgress={reportProgress}
        />
      )}

      <h1 className="mt-5 text-xl font-semibold text-ink-900">{lesson.title}</h1>

      {lesson.description && (
        <div className="prose-content mt-3" dangerouslySetInnerHTML={{ __html: lesson.description }} />
      )}
      {lesson.content && (lesson.lesson_type === "text" || lesson.lesson_type === "mixed") && (
        <div className="prose-content mt-3" dangerouslySetInnerHTML={{ __html: lesson.content }} />
      )}

      {lesson.lesson_resources.length > 0 && (
        <div className="mt-6 rounded-xl border border-ink-100 bg-ink-50 p-4">
          <h3 className="text-sm font-semibold text-ink-900">Course Materials</h3>
          <ul className="mt-2 space-y-1">
            {lesson.lesson_resources.map((resource) => (
              <li key={resource.id}>
                <a
                  href={`/api/materials/${resource.id}/download`}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-brand-700 hover:bg-white"
                >
                  <FileDown className="h-4 w-4 shrink-0" />
                  {resource.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between border-t border-ink-100 pt-5">
        <Button
          variant={completed ? "outline" : "primary"}
          onClick={toggleComplete}
          loading={saving}
          size="sm"
        >
          <CheckCircle2 className="h-4 w-4" />
          {completed ? "Completed" : "Mark Complete"}
        </Button>

        <div className="flex items-center gap-2">
          {prevLessonId ? (
            <Link href={`/dashboard/learn/${courseSlug}/${prevLessonId}`}>
              <Button variant="outline" size="sm">
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
            </Link>
          ) : (
            <Button variant="outline" size="sm" disabled>
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
          )}
          {nextLessonId ? (
            <Link href={`/dashboard/learn/${courseSlug}/${nextLessonId}`}>
              <Button variant="outline" size="sm">
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {lesson.duration_seconds > 0 && (
        <p className="mt-2 text-xs text-ink-400">{formatDuration(lesson.duration_seconds)}</p>
      )}
    </div>
  );
}
