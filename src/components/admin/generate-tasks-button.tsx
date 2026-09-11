"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { runWeeklyTaskGenerationAdmin } from "@/app/admin/mentorship/[programId]/students/[enrollmentId]/actions";

export function GenerateTasksButton({ programId, enrollmentId }: { programId: string; enrollmentId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await runWeeklyTaskGenerationAdmin(programId, enrollmentId);
        setMessage(result.created > 0 ? `${result.created} new task${result.created === 1 ? "" : "s"} generated.` : "Nothing new — already up to date.");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not generate tasks.");
      }
    });
  }

  return (
    <div>
      <Button variant="outline" size="sm" onClick={handleClick} loading={isPending}>
        Generate this week&apos;s tasks
      </Button>
      {message && <p className="mt-1 text-xs text-ink-500">{message}</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
