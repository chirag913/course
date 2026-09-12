import { formatCurrency } from "@/lib/utils";

interface SnapshotStat {
  label: string;
  value: string;
}

// Pure display — read-only. The editable KPI records (mentorship_kpis) are
// a SEPARATE, admin-entered concept surfaced in the KPI drawer; these
// numbers come straight from the already-computed economics/portfolio data
// so they can never drift from what the rest of the dashboard shows.
export function BusinessSnapshot({ stats }: { stats: SnapshotStat[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-ink-300 bg-ink-300 sm:grid-cols-4 lg:grid-cols-7">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-ink-100 p-3">
          <p className="font-display text-lg font-bold text-ink-900">{stat.value}</p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-ink-500">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}

export function moneyOrDash(value: number | null | undefined): string {
  if (value == null) return "—";
  return formatCurrency(value);
}

export function percentOrDash(value: number | null | undefined, digits = 0): string {
  if (value == null) return "—";
  return `${value.toFixed(digits)}%`;
}

export function multOrDash(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}x`;
}
