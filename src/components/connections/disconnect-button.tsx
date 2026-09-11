"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { disconnectConnection } from "@/app/dashboard/mentorship/[slug]/connections/actions";

export function DisconnectButton({ enrollmentId, connectionId }: { enrollmentId: string; connectionId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-500">Disconnect this account?</span>
        <Button
          variant="danger"
          size="sm"
          loading={isPending}
          onClick={() =>
            startTransition(async () => {
              try {
                await disconnectConnection(enrollmentId, connectionId);
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not disconnect.");
                setConfirming(false);
              }
            })
          }
        >
          Confirm
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
        Disconnect
      </Button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
