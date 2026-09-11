"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { setMentorTaskStatus } from "@/app/admin/mentorship/[programId]/students/[enrollmentId]/actions";
import { MentorTaskForm } from "./mentor-task-form";
import type { MentorshipTask, MentorshipTaskStatus } from "@/types/database";

const STATUS_TONE: Record<MentorshipTaskStatus, "success" | "warning" | "neutral"> = {
  TODO: "neutral",
  IN_PROGRESS: "warning",
  DONE: "success",
  SKIPPED: "neutral",
};

export function MentorTaskRow({
  programId,
  enrollmentId,
  task,
  productName,
  products,
}: {
  programId: string;
  enrollmentId: string;
  task: MentorshipTask;
  productName: string | null;
  products: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function setStatus(status: MentorshipTaskStatus) {
    setError(null);
    startTransition(async () => {
      try {
        await setMentorTaskStatus(programId, enrollmentId, task.id, status);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update task.");
      }
    });
  }

  if (editing) {
    return (
      <div className="border border-ink-300 p-3">
        <MentorTaskForm programId={programId} enrollmentId={enrollmentId} products={products} existingTask={task} onDone={() => setEditing(false)} />
      </div>
    );
  }

  const isOverdue = task.due_date && task.due_date < new Date().toISOString().slice(0, 10) && task.status !== "DONE" && task.status !== "SKIPPED";

  return (
    <div className="border border-ink-300 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[task.status]}>{task.status.replace("_", " ")}</Badge>
            <Badge tone="neutral">{task.priority.toUpperCase()}</Badge>
            <Badge tone="neutral">{task.source.replace("_", " ")}</Badge>
            {isOverdue && <Badge tone="warning">OVERDUE</Badge>}
            <p className="font-medium text-ink-900">{task.title}</p>
          </div>
          {productName && <p className="mt-1 font-mono text-xs text-ink-500">Product: {productName}</p>}
          {task.why && <p className="mt-1 text-sm text-ink-700">{task.why}</p>}
          {task.next_action && <p className="mt-1 text-sm text-ink-800">→ {task.next_action}</p>}
          {task.mentor_notes && <p className="mt-1 text-sm italic text-ink-500">Note: {task.mentor_notes}</p>}
          <p className="mt-1 font-mono text-xs text-ink-500">
            {task.due_date ? `Due ${formatDate(task.due_date)}` : "No due date"} · Created {formatDate(task.created_at)}
            {task.completed_at ? ` · Completed ${formatDate(task.completed_at)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
          {task.status !== "DONE" && (
            <Button variant="outline" size="sm" onClick={() => setStatus("DONE")} loading={isPending}>
              Complete
            </Button>
          )}
          {task.status !== "SKIPPED" && (
            <Button variant="ghost" size="sm" onClick={() => setStatus("SKIPPED")} loading={isPending}>
              Skip
            </Button>
          )}
          {(task.status === "DONE" || task.status === "SKIPPED") && (
            <Button variant="ghost" size="sm" onClick={() => setStatus("TODO")} loading={isPending}>
              Reopen
            </Button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
