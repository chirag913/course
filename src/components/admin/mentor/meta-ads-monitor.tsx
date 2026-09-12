"use client";

import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import type { MetaAdOverviewRow } from "@/lib/health/meta-ads-overview";

type Filter = "active" | "paused" | "all";

function fmt(value: number | null, kind: "money" | "int" | "percent") {
  if (value == null) return "—";
  if (kind === "money") return formatCurrency(value);
  if (kind === "percent") return `${value.toFixed(2)}%`;
  return value.toLocaleString("en-IN");
}

export function MetaAdsMonitor({ ads, lastSyncedLabel }: { ads: MetaAdOverviewRow[]; lastSyncedLabel: string | null }) {
  const [filter, setFilter] = useState<Filter>("active");

  const filtered = useMemo(() => {
    if (filter === "all") return ads;
    if (filter === "active") return ads.filter((a) => (a.status ?? "").toUpperCase() === "ACTIVE");
    return ads.filter((a) => (a.status ?? "").toUpperCase() !== "ACTIVE");
  }, [ads, filter]);

  const activeCount = ads.filter((a) => (a.status ?? "").toUpperCase() === "ACTIVE").length;

  return (
    <div className="rounded-lg border border-ink-300 bg-ink-100 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-display text-lg font-semibold text-ink-900">Meta Ads</p>
          {lastSyncedLabel && <p className="font-mono text-xs text-ink-500">Last synced {lastSyncedLabel}</p>}
        </div>
        <div className="inline-flex rounded-md border border-ink-300 p-0.5">
          {(["active", "paused", "all"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                filter === f ? "bg-brand-400 text-ink-50" : "text-ink-600 hover:bg-ink-200"
              }`}
            >
              {f === "active" ? `Active (${activeCount})` : f === "paused" ? "Paused" : "All"}
            </button>
          ))}
        </div>
      </div>

      {ads.length === 0 ? (
        <p className="mt-4 text-sm text-ink-500">No Meta ads synced yet.</p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-sm text-ink-500">No ads match this filter.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-ink-300 text-left font-mono text-[11px] uppercase text-ink-500">
                <th className="py-2 pr-3">Ad</th>
                <th className="py-2 pr-3">Spend</th>
                <th className="py-2 pr-3">CTR</th>
                <th className="py-2 pr-3">CPC</th>
                <th className="py-2 pr-3">Purchases</th>
                <th className="py-2 pr-3">CPA</th>
                <th className="py-2 pr-3">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 8).map((ad) => (
                <tr key={ad.id} className="border-b border-ink-300 last:border-b-0">
                  <td className="py-2 pr-3">
                    <p className="font-medium text-ink-900">{ad.name ?? "Unnamed ad"}</p>
                    {ad.campaignName && <p className="font-mono text-[11px] text-ink-500">{ad.campaignName}</p>}
                  </td>
                  <td className="py-2 pr-3 text-ink-700">{fmt(ad.spend, "money")}</td>
                  <td className="py-2 pr-3 text-ink-700">{fmt(ad.ctr, "percent")}</td>
                  <td className="py-2 pr-3 text-ink-700">{fmt(ad.cpc, "money")}</td>
                  <td className="py-2 pr-3 text-ink-700">{fmt(ad.purchases, "int")}</td>
                  <td className="py-2 pr-3 text-ink-700">{fmt(ad.cpa, "money")}</td>
                  <td className="py-2 pr-3 text-ink-700">{ad.roas != null ? `${ad.roas.toFixed(1)}x` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 8 && <p className="mt-2 text-xs text-ink-500">+{filtered.length - 8} more ads in this filter.</p>}
        </div>
      )}
    </div>
  );
}
