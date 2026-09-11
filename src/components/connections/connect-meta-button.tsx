"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { initiateMetaConnect } from "@/app/dashboard/mentorship/[slug]/connections/actions";

export function ConnectMetaButton({ enrollmentId }: { enrollmentId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        await initiateMetaConnect(enrollmentId);
      } catch (e) {
        // A successful call never returns here — it redirects. Reaching
        // this catch means the connect attempt genuinely failed.
        setError(e instanceof Error ? e.message : "Could not start the connection.");
      }
    });
  }

  return (
    <div>
      <Button onClick={handleClick} loading={isPending}>
        Connect Meta Ads
      </Button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
