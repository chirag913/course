"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateTaskStatus } from "@/app/dashboard/mentorship/[slug]/actions";
import type { MentorshipTaskStatus } from "@/types/database";

const NEXT_STATUS: Record<MentorshipTaskStatus, MentorshipTaskStatus> = {
  TODO: "IN_PROGRESS",
  IN_PROGRESS: "DONE",
  DONE: "TODO",
  SKIPPED: "TODO",
};

const ICON: Record<MentorshipTaskStatus, typeof Circle> = {
  TODO: Circle,
  IN_PROGRESS: CircleDashed,
  DONE: CheckCircle2,
  SKIPPED: Circle,
};

export function TaskStatusToggle({ enrollmentId, taskId, status }: { enrollmentId: string; taskId: string; status: MentorshipTaskStatus }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const Icon = ICON[status];

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        await updateTaskStatus(enrollmentId, taskId, NEXT_STATUS[status]);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update this task.");
      }
    });
  }

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={handleClick}
        disabled={isPending}
        title={status === "DONE" ? "Mark not done" : "Mark done"}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full border transition-colors disabled:opacity-50",
          status === "DONE" ? "border-success bg-success/10 text-success" : "border-ink-400 text-ink-500 hover:border-brand-400 hover:text-brand-300"
        )}
      >
        <Icon className="h-4 w-4" />
      </button>
      {error && <p className="mt-1 max-w-[80px] text-center text-[10px] text-danger">{error}</p>}
    </div>
  );
}
