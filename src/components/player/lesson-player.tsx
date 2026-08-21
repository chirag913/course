"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import Link from "next/link";
import { VideoPlayer } from "@/components/video/video-player";
import { Button } from "@/components/ui/button";
import { Download, Check, ChevronLeft, ArrowRight, PartyPopper } from "lucide-react";
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
      <div className="flex flex-col items-center justify-center border border-ink-300 px-6 py-24 text-center">
        <PartyPopper className="h-9 w-9 text-brand-400" />
        <h2 className="mt-5 font-display text-2xl font-bold tracking-tight text-ink-900">
          Course Completed
        </h2>
        <p className="mt-2 text-ink-500">Great work — you&apos;ve finished every lesson.</p>
        <Link href="/dashboard">
          <Button className="mt-6">Back to My Courses</Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      {(lesson.lesson_type === "video" || lesson.lesson_type === "mixed") && (
        <VideoPlayer
          provider={lesson.video_provider ?? "youtube"}
          videoId={lesson.video_id}
          title={lesson.title}
          startSeconds={initialPositionSeconds}
          onProgress={reportProgress}
        />
      )}

      <div className="mt-6 border-t border-ink-300 pt-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">{lesson.title}</h1>
        {lesson.duration_seconds > 0 && (
          <p className="mt-1 font-mono text-xs text-ink-500">{formatDuration(lesson.duration_seconds)}</p>
        )}

        {lesson.description && (
          <div className="prose-content mt-4" dangerouslySetInnerHTML={{ __html: lesson.description }} />
        )}
        {lesson.content && (lesson.lesson_type === "text" || lesson.lesson_type === "mixed") && (
          <div className="prose-content mt-4" dangerouslySetInnerHTML={{ __html: lesson.content }} />
        )}
      </div>

      {lesson.lesson_resources.length > 0 && (
        <div className="mt-8 border-t border-ink-300 pt-6">
          <p className="eyebrow">Course Material</p>
          <ul className="mt-3 divide-y divide-ink-300">
            {lesson.lesson_resources.map((resource) => (
              <li key={resource.id}>
                <a
                  href={`/api/materials/${resource.id}/download`}
                  className="group flex items-center justify-between gap-3 py-3 text-sm text-ink-800 transition-colors hover:text-brand-300"
                >
                  <span className="truncate">{resource.name}</span>
                  <Download className="h-4 w-4 shrink-0 text-ink-500 transition-colors group-hover:text-brand-300" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-ink-300 pt-6">
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

        <Button variant={completed ? "outline" : "primary"} onClick={toggleComplete} loading={saving}>
          {completed ? (
            <>
              <Check className="h-4 w-4" /> Completed
            </>
          ) : (
            <>
              Complete &amp; Continue <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
