"use client";

import { Drawer } from "./drawer";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { addMentorshipKpi, updateMentorshipKpi, deleteMentorshipKpi } from "@/app/admin/mentorship/[programId]/students/[enrollmentId]/actions";
import type { MentorshipKpi } from "@/types/database";

function toIsoDate(date: string): string {
  return new Date(date).toISOString().slice(0, 10);
}

export function KpiDrawer({
  programId,
  enrollmentId,
  kpis,
  onClose,
}: {
  programId: string;
  enrollmentId: string;
  kpis: MentorshipKpi[];
  onClose: () => void;
}) {
  return (
    <Drawer title="KPIs" onClose={onClose}>
      <form action={addMentorshipKpi.bind(null, programId, enrollmentId)} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="metric_key">Metric key</Label>
            <Input id="metric_key" name="metric_key" required />
          </div>
          <div>
            <Label htmlFor="metric_label">Metric label</Label>
            <Input id="metric_label" name="metric_label" />
          </div>
          <div>
            <Label htmlFor="value">Value</Label>
            <Input id="value" name="value" type="number" required />
          </div>
          <div>
            <Label htmlFor="recorded_for">Recorded on</Label>
            <Input id="recorded_for" name="recorded_for" type="date" required defaultValue={toIsoDate(new Date().toISOString())} />
          </div>
        </div>
        <Button size="sm">Add KPI value</Button>
      </form>

      <div className="mt-5">
        {kpis.length === 0 ? (
          <p className="text-sm text-ink-500">No KPI history yet.</p>
        ) : (
          <div className="divide-y divide-ink-300 border-t border-ink-300">
            {kpis.map((kpi) => (
              <div key={kpi.id} className="grid gap-3 py-3 sm:grid-cols-2 sm:items-end">
                <form action={updateMentorshipKpi.bind(null, programId, enrollmentId)} className="grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="kpi_id" value={kpi.id} />
                  <div>
                    <Label>Metric key</Label>
                    <Input name="metric_key" defaultValue={kpi.metric_key} required />
                  </div>
                  <div>
                    <Label>Metric label</Label>
                    <Input name="metric_label" defaultValue={kpi.metric_label} />
                  </div>
                  <div>
                    <Label>Value</Label>
                    <Input name="value" type="number" defaultValue={kpi.value} required />
                  </div>
                  <div>
                    <Label>Recorded on</Label>
                    <Input name="recorded_for" type="date" defaultValue={kpi.recorded_for} required />
                  </div>
                  <div className="sm:col-span-2">
                    <Button variant="outline" size="sm">
                      Save
                    </Button>
                  </div>
                </form>

                <form action={deleteMentorshipKpi.bind(null, programId, enrollmentId, kpi.id)}>
                  <Button variant="danger" size="sm">
                    Delete
                  </Button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}
