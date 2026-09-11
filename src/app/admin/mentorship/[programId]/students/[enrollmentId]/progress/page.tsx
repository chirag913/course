import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getProgressData } from "@/lib/progress/runner";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import type { MetricComparison, PeriodComparison } from "@/lib/progress/types";

interface Props {
  params: Promise<{ programId: string; enrollmentId: string }>;
}

function formatMinor(minor: number | null): string {
  return minor != null ? formatCurrency(minor, "INR") : "—";
}

function ComparisonTable({ comparison }: { comparison: PeriodComparison }) {
  const rows: { label: string; metric: MetricComparison; format: (v: number) => string }[] = [
    { label: "Revenue", metric: comparison.revenue, format: formatMinor },
    { label: "Ad spend", metric: comparison.adSpend, format: formatMinor },
    { label: "Orders", metric: comparison.orders, format: (v) => String(v) },
    { label: "Delivered", metric: comparison.delivered, format: (v) => String(v) },
    { label: "RTO (count)", metric: comparison.rto, format: (v) => String(v) },
    { label: "Contribution profit", metric: comparison.contributionProfit, format: formatMinor },
  ];
  return (
    <div className="border border-ink-300 p-4">
      <p className="font-medium text-ink-900">
        {comparison.label} <span className="font-mono text-xs text-ink-500">({comparison.currentRange.start}..{comparison.currentRange.end} vs {comparison.previousRange.start}..{comparison.previousRange.end})</span>
      </p>
      {!comparison.hasSufficientData ? (
        <p className="mt-2 text-sm text-ink-500">Not enough activity in either period to compare.</p>
      ) : (
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="font-mono text-[11px] uppercase text-ink-500">
              <th className="pb-1 pr-4">Metric</th>
              <th className="pb-1 pr-4">Current</th>
              <th className="pb-1 pr-4">Previous</th>
              <th className="pb-1">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-ink-300">
                <td className="py-1 pr-4 text-ink-500">{row.label}</td>
                <td className="py-1 pr-4 text-ink-900">{row.metric.current != null ? row.format(row.metric.current) : "—"}</td>
                <td className="py-1 pr-4 text-ink-900">{row.metric.previous != null ? row.format(row.metric.previous) : "—"}</td>
                <td className="py-1 text-ink-900">
                  {row.metric.changePercent != null
                    ? `${row.metric.changePercent > 0 ? "+" : ""}${row.metric.changePercent.toFixed(1)}%`
                    : row.metric.changeAbsolute != null
                      ? `${row.metric.changeAbsolute > 0 ? "+" : ""}${row.format(row.metric.changeAbsolute)}`
                      : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default async function MentorProgressPage({ params }: Props) {
  const { programId, enrollmentId } = await params;
  await requireAdmin();
  const supabase = await createClient();

  const { data: program } = await supabase.from("programs").select("id, slug, title").eq("id", programId).eq("type_id", "mentorship").maybeSingle();
  if (!program) notFound();

  const { data: enrollment } = await supabase.from("enrollments").select("id, user_id, profiles(full_name)").eq("id", enrollmentId).eq("program_id", program.id).maybeSingle();
  if (!enrollment) notFound();

  const { data: studentProfileRow } = await supabase.from("profiles").select("full_name").eq("id", enrollment.user_id).single();
  const studentName = (studentProfileRow as { full_name: string | null } | null)?.full_name ?? "Unnamed Student";

  const progress = await getProgressData(supabase, enrollment.id);
  const backHref = `/admin/mentorship/${program.id}/students/${enrollment.id}`;

  return (
    <div>
      <Link href={backHref} className="mb-5 inline-flex items-center text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="mr-1 h-3.5 w-3.5" />
        Back to workspace
      </Link>
      <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Longitudinal progress</p>
      <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink-900">{studentName}</h1>
      <p className="mt-1 text-sm text-ink-500">
        {progress.mentorshipJourney.joinDateIso ? `Joined ${formatDate(progress.mentorshipJourney.joinDateIso)}` : "Join date not set"}
        {progress.mentorshipJourney.weeksInMentorship != null && ` · Week ${progress.mentorshipJourney.weeksInMentorship}`}
        {` · ${progress.mentorshipJourney.callsCompleted} call(s) completed`}
      </p>

      {/* BUSINESS PROGRESS — underlying numbers, not just a sentence */}
      <section className="mt-6 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Business progress</h2>
        <div className="mt-3 space-y-3">
          <ComparisonTable comparison={progress.currentWeekComparison} />
          <ComparisonTable comparison={progress.rolling30dComparison} />
          {progress.sinceJoining ? (
            <div className="border border-ink-300 p-4">
              <p className="font-medium text-ink-900">
                Since {formatDate(progress.sinceJoining.dataAvailableFromIso)}
                {progress.sinceJoining.truncated && <span className="ml-2 text-xs text-ink-500">(data available from this date — mentorship start predates it)</span>}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="font-mono text-[11px] uppercase text-ink-500">Revenue</p>
                  <p className="text-ink-900">{formatMinor(progress.sinceJoining.economics.totalRevenue)}</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase text-ink-500">Ad spend</p>
                  <p className="text-ink-900">{formatMinor(progress.sinceJoining.economics.totalAdSpend)}</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase text-ink-500">Orders / Delivered / RTO</p>
                  <p className="text-ink-900">
                    {progress.sinceJoining.economics.totalOrders} / {progress.sinceJoining.economics.totalDelivered} / {progress.sinceJoining.economics.totalRto}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase text-ink-500">Contribution profit</p>
                  <p className="text-ink-900">
                    {progress.sinceJoining.economics.totalContributionProfit != null ? formatMinor(progress.sinceJoining.economics.totalContributionProfit) : "Incomplete"}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-500">Not enough history yet for a since-joining summary.</p>
          )}
        </div>
      </section>

      {/* PRODUCT DECISION TIMELINES — full, including overrides */}
      <section className="mt-6 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Product decision timelines</h2>
        {progress.productTimelines.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">No product has been evaluated yet.</p>
        ) : (
          <div className="mt-4 space-y-5">
            {progress.productTimelines.map((timeline) => (
              <div key={timeline.productId}>
                <p className="font-medium text-ink-900">{timeline.productName}</p>
                <div className="mt-2 space-y-1.5 border-l-2 border-ink-300 pl-4">
                  {timeline.entries.map((entry, i) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium text-ink-900">{entry.decision.replace(/_/g, " ")}</span>
                      <span className="ml-2 font-mono text-xs text-ink-500">{formatDate(entry.effectiveAt)}</span>
                      {entry.isOverride ? (
                        <Badge tone="brand" className="ml-2">
                          OVERRIDE — {entry.overrideReason}
                        </Badge>
                      ) : (
                        entry.reasonCode && (
                          <Badge tone="neutral" className="ml-2">
                            {entry.reasonCode}
                          </Badge>
                        )
                      )}
                      <span className="ml-2 text-xs text-ink-500">{entry.ongoing ? `${entry.daysInState}d so far` : `${entry.daysInState}d in state`}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* EXECUTION HISTORY — split by source */}
      <section className="mt-6 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Execution history</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="font-mono text-[11px] uppercase text-ink-500">
                <th className="pb-2 pr-4">Week of</th>
                <th className="pb-2 pr-4">Completed</th>
                <th className="pb-2 pr-4">Skipped</th>
                <th className="pb-2">Completion rate</th>
              </tr>
            </thead>
            <tbody>
              {progress.executionHistory.weeks.map((week) => (
                <tr key={week.isoWeek} className="border-t border-ink-300">
                  <td className="py-1.5 pr-4 text-ink-700">{formatDate(week.weekStartIso)}</td>
                  <td className="py-1.5 pr-4 text-ink-900">{week.completed}</td>
                  <td className="py-1.5 pr-4 text-ink-900">{week.skipped}</td>
                  <td className="py-1.5 text-ink-900">{week.completionRate != null ? `${(week.completionRate * 100).toFixed(0)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-sm text-ink-700">{progress.executionHistory.overdueNow} task(s) overdue right now.</p>
        <div className="mt-3 border-t border-ink-300 pt-3">
          <p className="mb-1 font-mono text-[11px] uppercase text-ink-500">By source</p>
          <table className="w-full max-w-md text-left text-sm">
            <thead>
              <tr className="font-mono text-[11px] uppercase text-ink-500">
                <th className="pb-1 pr-4">Source</th>
                <th className="pb-1 pr-4">Completed</th>
                <th className="pb-1">Skipped</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(progress.executionHistory.bySource).map(([source, counts]) => (
                <tr key={source} className="border-t border-ink-300">
                  <td className="py-1 pr-4 text-ink-700">{source.replace(/_/g, " ")}</td>
                  <td className="py-1 pr-4 text-ink-900">{counts?.completed ?? 0}</td>
                  <td className="py-1 text-ink-900">{counts?.skipped ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* REVIEW HISTORY */}
      <section className="mt-6 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Review history</h2>
        <p className="mt-1 text-sm text-ink-500">What changed between each pair of consecutive completed calls.</p>
        {progress.reviewCycles.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">No completed calls yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {progress.reviewCycles.map((cycle, i) => (
              <div key={i} className="border border-ink-300 p-3">
                <p className="font-mono text-xs uppercase text-ink-500">
                  {cycle.isFirstCycle ? "Joined" : formatDate(cycle.fromIso)} → {cycle.isCurrent ? "now" : formatDate(cycle.toIso)}
                  {cycle.isCurrent && (
                    <Badge tone="neutral" className="ml-2">
                      CURRENT
                    </Badge>
                  )}
                </p>
                {!cycle.hasMeaningfulChange ? (
                  <p className="mt-1 text-sm text-ink-500">No meaningful changes.</p>
                ) : (
                  <div className="mt-1 space-y-1 text-sm text-ink-700">
                    {cycle.decisionChanges.map((change, j) => (
                      <p key={j}>
                        {change.productName}: {change.from ? change.from.replace(/_/g, " ") : "first evaluated"} → {change.to.replace(/_/g, " ")}
                        {change.isOverride && (
                          <Badge tone="brand" className="ml-2">
                            OVERRIDE
                          </Badge>
                        )}
                      </p>
                    ))}
                    {cycle.tasksCompletedCount > 0 && <p>{cycle.tasksCompletedCount} task(s) completed in this window.</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* MENTOR DIRECTION HISTORY — juxtaposed with progress, never claimed as cause */}
      <section className="mt-6 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Mentor direction history</h2>
        <p className="mt-1 text-sm text-ink-500">
          Shown alongside business progress for your own judgment — this page does not claim that a direction caused any change.
        </p>
        {progress.mentorshipJourney.directionHistory.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">No direction has been set yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {[...progress.mentorshipJourney.directionHistory].reverse().map((entry, i) => (
              <div key={i} className="border-l-2 border-brand-400/50 pl-3 text-sm">
                <p className="text-ink-800">{entry.note}</p>
                <p className="mt-0.5 font-mono text-xs text-ink-500">Recorded {formatDate(entry.setAt)}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
