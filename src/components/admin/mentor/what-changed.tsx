import { formatDate } from "@/lib/utils";
import type { ChangeSinceReview } from "@/lib/health/types";

export function WhatChanged({ changes, reviewCutoffIso }: { changes: ChangeSinceReview[]; reviewCutoffIso: string }) {
  return (
    <div className="rounded-lg border border-ink-300 bg-ink-100 p-5">
      <p className="font-display text-lg font-semibold text-ink-900">What Changed Since Last Review</p>
      <p className="font-mono text-xs text-ink-500">Since {formatDate(reviewCutoffIso)}</p>

      {changes.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">No notable changes since the last review.</p>
      ) : (
        <ul className="mt-3 space-y-1.5 text-sm text-ink-700">
          {changes.map((change, i) => (
            <li key={i}>{change.detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
