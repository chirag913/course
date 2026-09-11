"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { syncProvider } from "@/app/dashboard/mentorship/[slug]/connections/actions";
import type { MentorshipConnectionProvider } from "@/types/database";

export function SyncNowButton({
  enrollmentId,
  provider,
}: {
  enrollmentId: string;
  provider: MentorshipConnectionProvider;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        await syncProvider(enrollmentId, provider);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sync failed. Please try again.");
      }
    });
  }

  return (
    <div>
      <Button variant="outline" size="sm" onClick={handleClick} loading={isPending}>
        Sync now
      </Button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
