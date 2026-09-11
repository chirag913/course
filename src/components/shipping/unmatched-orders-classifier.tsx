"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { bulkClassifyUnmatchedOrders } from "@/app/dashboard/mentorship/[slug]/shipping/actions";
import type { UnmatchedOrder } from "@/lib/shipping/classification";
import type { UnmatchedOrderClassification } from "@/types/database";

const CLASSIFICATION_OPTIONS: { value: UnmatchedOrderClassification; label: string }[] = [
  { value: "cancelled", label: "Cancelled" },
  { value: "rejected", label: "Rejected" },
  { value: "never_shipped", label: "Never shipped" },
  { value: "other", label: "Other" },
  { value: "needs_review", label: "Needs review" },
];

export function UnmatchedOrdersClassifier({ enrollmentId, orders }: { enrollmentId: string; orders: UnmatchedOrder[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [classification, setClassification] = useState<UnmatchedOrderClassification>("needs_review");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (orders.length === 0) {
    return <p className="text-sm text-ink-500">Every Shopify order appears in a shipping report — nothing to classify.</p>;
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === orders.length ? new Set() : new Set(orders.map((o) => o.shopifyOrderId))));
  }

  function handleClassify() {
    setError(null);
    startTransition(async () => {
      try {
        await bulkClassifyUnmatchedOrders(enrollmentId, Array.from(selected), classification, notes.trim() || null);
        setSelected(new Set());
        setNotes("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save these classifications.");
      }
    });
  }

  return (
    <div>
      <p className="text-sm text-ink-700">
        <strong>{orders.length}</strong> Shopify order{orders.length === 1 ? " is" : "s are"} not present in your shipping report. These are{" "}
        <strong>not assumed to be RTO or delivered</strong> — classify them below.
      </p>

      <div className="mt-3 max-h-80 overflow-y-auto overflow-x-auto border border-ink-300">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-ink-300 text-left font-mono text-xs uppercase text-ink-500">
              <th className="p-2">
                <input type="checkbox" checked={selected.size === orders.length} onChange={toggleAll} />
              </th>
              <th className="p-2">Order</th>
              <th className="p-2">Date</th>
              <th className="p-2">Current classification</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.shopifyOrderId} className="border-b border-ink-300 last:border-b-0">
                <td className="p-2">
                  <input type="checkbox" checked={selected.has(o.shopifyOrderId)} onChange={() => toggle(o.shopifyOrderId)} />
                </td>
                <td className="p-2 font-mono text-xs text-ink-700">{o.orderNumber ? `#${o.orderNumber}` : o.externalOrderId}</td>
                <td className="p-2 font-mono text-xs text-ink-500">{o.createdAtExternal ? formatDate(o.createdAtExternal) : "—"}</td>
                <td className="p-2">
                  {o.existingClassification ? <Badge tone="neutral">{o.existingClassification}</Badge> : <span className="text-ink-500">Unclassified</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={classification}
          onChange={(e) => setClassification(e.target.value as UnmatchedOrderClassification)}
          className="h-10 rounded-md border border-ink-300 bg-ink-100 px-3 text-sm text-ink-900"
        >
          {CLASSIFICATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="h-10 max-w-xs flex-1 rounded-md border border-ink-300 bg-ink-100 px-3 text-sm text-ink-900"
        />
        <Button onClick={handleClassify} disabled={selected.size === 0} loading={isPending}>
          Classify selected ({selected.size})
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
