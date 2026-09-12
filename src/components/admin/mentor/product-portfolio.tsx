"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { ProductDetailDrawer } from "./product-detail-drawer";
import type { ProductPortfolioEntry } from "@/lib/products/portfolio";
import type { DateRangePreset } from "@/lib/products/date-range";
import type { ProductDecisionState } from "@/types/database";

// Same decision->tone mapping as the student-facing products page
// (dashboard/mentorship/[slug]/products/page.tsx) — one vocabulary for
// decision colors across the whole app, not a second invented here.
const DECISION_TONE: Record<ProductDecisionState, "success" | "warning" | "neutral" | "brand"> = {
  SCALE: "success",
  RELAUNCH: "brand",
  ITERATE: "warning",
  WATCH: "neutral",
  TEST: "neutral",
  DATA_NEEDED: "warning",
  KILL: "warning",
};

export function ProductPortfolio({
  entries,
  enrollmentId,
  rangePreset,
  customStart,
  customEnd,
}: {
  entries: ProductPortfolioEntry[];
  enrollmentId: string;
  rangePreset: DateRangePreset;
  customStart?: string;
  customEnd?: string;
}) {
  const [openProductId, setOpenProductId] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-ink-300 bg-ink-100 p-5">
      <p className="font-display text-lg font-semibold text-ink-900">Product Portfolio</p>

      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">No active products yet.</p>
      ) : (
        <div className="mt-3 divide-y divide-ink-300">
          {entries.map((entry) => (
            <button
              key={entry.product.id}
              onClick={() => setOpenProductId(entry.product.id)}
              className="flex w-full flex-wrap items-center justify-between gap-2 py-3 text-left transition-colors hover:bg-ink-200/50"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-ink-900">{entry.product.name}</p>
                  {entry.effectiveDecision ? (
                    <Badge tone={DECISION_TONE[entry.effectiveDecision]}>{entry.effectiveDecision.replace("_", " ")}</Badge>
                  ) : (
                    <Badge>Not evaluated</Badge>
                  )}
                </div>
                <p className="mt-1 font-mono text-xs text-ink-500">
                  {formatCurrency(entry.adSpend ?? 0)} spend · {formatCurrency(entry.revenue)} revenue · {entry.ordersCount} orders ·{" "}
                  {entry.blendedRoas != null ? `${entry.blendedRoas.toFixed(1)}x ROAS` : "— ROAS"} ·{" "}
                  {entry.rtoRate != null ? `${entry.rtoRate.toFixed(0)}% RTO` : "— RTO"}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {openProductId && (
        <ProductDetailDrawer
          enrollmentId={enrollmentId}
          productId={openProductId}
          rangePreset={rangePreset}
          customStart={customStart}
          customEnd={customEnd}
          onClose={() => setOpenProductId(null)}
        />
      )}
    </div>
  );
}
