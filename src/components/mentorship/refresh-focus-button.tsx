"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { runWeeklyTaskGeneration } from "@/app/dashboard/mentorship/[slug]/actions";

export function RefreshFocusButton({ enrollmentId }: { enrollmentId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await runWeeklyTaskGeneration(enrollmentId);
        setMessage(result.created > 0 ? `${result.created} new task${result.created === 1 ? "" : "s"} added.` : "You're all caught up — nothing new to add.");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not refresh your focus.");
      }
    });
  }

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={handleClick} loading={isPending}>
        Refresh
      </Button>
      {message && <p className="mt-1 text-xs text-ink-500">{message}</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
