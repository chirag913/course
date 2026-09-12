"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setMentorTaskStatus } from "@/app/admin/mentorship/[programId]/students/[enrollmentId]/actions";
import type { MentorshipTask, MentorshipTaskPriority } from "@/types/database";

const PRIORITY_TONE: Record<MentorshipTaskPriority, "warning" | "neutral"> = {
  high: "warning",
  medium: "neutral",
  low: "neutral",
};

export function WeeklyFocus({
  programId,
  enrollmentId,
  tasks,
  onOpenHistory,
}: {
  programId: string;
  enrollmentId: string;
  tasks: MentorshipTask[];
  onOpenHistory: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  function setStatus(taskId: string, status: "DONE" | "SKIPPED") {
    setPendingId(taskId);
    startTransition(async () => {
      try {
        await setMentorTaskStatus(programId, enrollmentId, taskId, status);
        router.refresh();
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="rounded-lg border border-ink-300 bg-ink-100 p-5">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg font-semibold text-ink-900">This Week&apos;s Focus</p>
        <Button variant="ghost" size="sm" onClick={onOpenHistory}>
          View all tasks →
        </Button>
      </div>

      {tasks.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">Nothing on the plate right now. Generate tasks or check back later.</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {tasks.map((task, i) => (
            <li key={task.id} className="flex items-start justify-between gap-3 border-t border-ink-300 pt-2 first:border-t-0 first:pt-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-ink-500">{i + 1}</span>
                  <Badge tone={PRIORITY_TONE[task.priority]}>{task.priority.toUpperCase()}</Badge>
                  <p className="font-medium text-ink-900">{task.title}</p>
                </div>
                {task.why && <p className="mt-0.5 pl-6 text-xs text-ink-500">Why: {task.why}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  loading={isPending && pendingId === task.id}
                  onClick={() => setStatus(task.id, "DONE")}
                >
                  Complete
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={isPending && pendingId === task.id}
                  onClick={() => setStatus(task.id, "SKIPPED")}
                >
                  Skip
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
