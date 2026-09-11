"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createMentorOverride } from "@/app/dashboard/mentorship/[slug]/products/decisions-actions";
import type { ProductDecisionState } from "@/types/database";

const DECISION_OPTIONS: ProductDecisionState[] = ["DATA_NEEDED", "TEST", "WATCH", "ITERATE", "SCALE", "RELAUNCH", "KILL"];

export function MentorOverrideForm({ enrollmentId, productCatalogId }: { enrollmentId: string; productCatalogId: string }) {
  const [decision, setDecision] = useState<ProductDecisionState>("WATCH");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createMentorOverride(enrollmentId, productCatalogId, decision, reason);
        setReason("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the override.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2 border-t border-ink-300 pt-3">
      <p className="font-mono text-xs uppercase text-ink-500">Mentor override (admin only)</p>
      <div className="flex flex-wrap gap-2">
        <select
          value={decision}
          onChange={(e) => setDecision(e.target.value as ProductDecisionState)}
          className="h-10 rounded-md border border-ink-300 bg-ink-100 px-3 text-sm text-ink-900"
        >
          {DECISION_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for overriding (required)"
          className="h-10 max-w-sm flex-1 rounded-md border border-ink-300 bg-ink-100 px-3 text-sm text-ink-900"
        />
        <Button type="submit" size="sm" loading={isPending}>
          Save override
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
