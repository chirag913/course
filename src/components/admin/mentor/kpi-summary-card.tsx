"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { KpiDrawer } from "./kpi-drawer";
import type { MentorshipKpi } from "@/types/database";

const REQUIRED_KPI_KEYS = ["revenue", "ad_spend", "orders", "cpa", "roas", "rto", "profit"];

export function KpiSummaryCard({
  programId,
  enrollmentId,
  kpis,
}: {
  programId: string;
  enrollmentId: string;
  kpis: MentorshipKpi[];
}) {
  const [open, setOpen] = useState(false);

  const latestByKey = new Map<string, MentorshipKpi>();
  for (const kpi of kpis) {
    if (!latestByKey.has(kpi.metric_key)) latestByKey.set(kpi.metric_key, kpi);
  }

  return (
    <div className="rounded-lg border border-ink-300 bg-ink-100 p-5">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg font-semibold text-ink-900">KPIs</p>
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          Edit KPIs
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {REQUIRED_KPI_KEYS.map((key) => {
          const metric = latestByKey.get(key);
          return (
            <div key={key}>
              <p className="font-mono text-[10px] uppercase text-ink-500">{(metric?.metric_label ?? key).replace("_", " ")}</p>
              <p className="mt-0.5 font-semibold text-ink-900">{metric ? metric.value : "—"}</p>
            </div>
          );
        })}
      </div>

      {open && <KpiDrawer programId={programId} enrollmentId={enrollmentId} kpis={kpis} onClose={() => setOpen(false)} />}
    </div>
  );
}
