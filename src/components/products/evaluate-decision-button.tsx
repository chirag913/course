"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { evaluateProductDecision } from "@/app/dashboard/mentorship/[slug]/products/decisions-actions";
import type { DateRangePreset } from "@/lib/products/date-range";

export function EvaluateDecisionButton({
  enrollmentId,
  productCatalogId,
  rangePreset,
}: {
  enrollmentId: string;
  productCatalogId: string;
  rangePreset: DateRangePreset;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        await evaluateProductDecision(enrollmentId, productCatalogId, rangePreset);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not evaluate this product.");
      }
    });
  }

  return (
    <div>
      <Button variant="outline" size="sm" onClick={handleClick} loading={isPending}>
        Re-evaluate
      </Button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
