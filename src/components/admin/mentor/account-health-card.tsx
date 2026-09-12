import { Badge } from "@/components/ui/badge";
import type { AccountHealthResult } from "@/lib/health/types";
import type { AttentionBottleneck } from "@/lib/health/types";

const HEALTH_TONE: Record<AccountHealthResult["status"], "success" | "warning" | "neutral"> = {
  HEALTHY: "success",
  AT_RISK: "warning",
  CRITICAL: "warning",
  INSUFFICIENT_DATA: "neutral",
};

const HEALTH_LABEL: Record<AccountHealthResult["status"], string> = {
  HEALTHY: "Healthy",
  AT_RISK: "At Risk",
  CRITICAL: "Critical",
  INSUFFICIENT_DATA: "Insufficient Data",
};

// This is the ONE thing the mentor reads first — everything else on the
// dashboard exists to support or explain this card. Deliberately shows only
// the PRIMARY bottleneck; briefing.bottlenecks[1:] surface in the compact
// "also needs attention" line, never the full health-calculation reasons.
export function AccountHealthCard({
  health,
  primaryBottleneck,
  secondaryCount,
}: {
  health: AccountHealthResult;
  primaryBottleneck: AttentionBottleneck | null;
  secondaryCount: number;
}) {
  return (
    <div className="rounded-lg border border-ink-300 bg-ink-100 p-5">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-wide text-ink-500">Account Health</p>
        <Badge tone={HEALTH_TONE[health.status]}>{HEALTH_LABEL[health.status]}</Badge>
      </div>

      {!primaryBottleneck ? (
        <p className="mt-3 text-sm text-ink-500">No urgent business issue right now.</p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-ink-500">Primary Issue</p>
            <p className="mt-0.5 text-sm font-medium text-ink-900">
              {primaryBottleneck.productName ? `${primaryBottleneck.productName}: ` : ""}
              {primaryBottleneck.what}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-ink-500">Why</p>
            <p className="mt-0.5 text-sm text-ink-700">{primaryBottleneck.why}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-ink-500">Next Action</p>
            <p className="mt-0.5 text-sm text-ink-700">→ {primaryBottleneck.nextAction}</p>
          </div>
        </div>
      )}

      {secondaryCount > 0 && (
        <p className="mt-3 border-t border-ink-300 pt-2 text-xs text-ink-500">
          +{secondaryCount} other issue{secondaryCount !== 1 ? "s" : ""} also need attention.
        </p>
      )}
    </div>
  );
}
