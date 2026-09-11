import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getEffectiveMentorshipStatus } from "@/lib/mentorship-access";
import { getProgressData } from "@/lib/progress/runner";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import type { MentorshipProfile } from "@/types/database";
import type { MetricComparison, PeriodComparison } from "@/lib/progress/types";

interface Props {
  params: Promise<{ slug: string }>;
}

function formatMinor(minor: number | null): string {
  return minor != null ? formatCurrency(minor, "INR") : "—";
}

function ComparisonRow({ label, metric, formatValue }: { label: string; metric: MetricComparison; formatValue: (v: number) => string }) {
  const trendText =
    metric.changePercent != null
      ? `${metric.changePercent > 0 ? "+" : ""}${metric.changePercent.toFixed(0)}%`
      : metric.current != null && metric.previous != null
        ? "—" // both known but previous was zero: percentage would be meaningless
        : null;
  return (
    <div className="flex items-center justify-between border-t border-ink-300 py-2 text-sm first:border-t-0">
      <span className="text-ink-500">{label}</span>
      <span className="text-ink-900">
        {metric.current != null ? formatValue(metric.current) : "—"}
        {metric.previous != null && <span className="ml-2 text-xs text-ink-500">(was {formatValue(metric.previous)})</span>}
        {trendText && <span className={`ml-2 font-mono text-xs ${metric.changePercent != null && metric.changePercent > 0 ? "text-success" : "text-ink-500"}`}>{trendText}</span>}
      </span>
    </div>
  );
}

function ComparisonCard({ comparison }: { comparison: PeriodComparison }) {
  if (!comparison.hasSufficientData) {
    return (
      <div className="border border-ink-300 p-4">
        <p className="font-medium text-ink-900">{comparison.label}</p>
        <p className="mt-2 text-sm text-ink-500">Not enough activity yet in either period to compare.</p>
      </div>
    );
  }
  return (
    <div className="border border-ink-300 p-4">
      <p className="font-medium text-ink-900">{comparison.label}</p>
      <div className="mt-2">
        <ComparisonRow label="Revenue" metric={comparison.revenue} formatValue={formatMinor} />
        <ComparisonRow label="Ad spend" metric={comparison.adSpend} formatValue={formatMinor} />
        <ComparisonRow label="Orders" metric={comparison.orders} formatValue={(v) => String(v)} />
        <ComparisonRow label="Delivered" metric={comparison.delivered} formatValue={(v) => String(v)} />
        <ComparisonRow label="RTO" metric={comparison.rto} formatValue={(v) => String(v)} />
        {comparison.contributionProfit.current != null && comparison.contributionProfit.previous != null ? (
          <ComparisonRow label="Contribution profit" metric={comparison.contributionProfit} formatValue={formatMinor} />
        ) : (
          <div className="flex items-center justify-between border-t border-ink-300 py-2 text-sm">
            <span className="text-ink-500">Contribution profit</span>
            <span className="text-ink-500">Incomplete economics in one or both periods</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default async function StudentProgressPage({ params }: Props) {
  const { slug } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: program } = await supabase.from("programs").select("id, slug, title").eq("slug", slug).eq("type_id", "mentorship").maybeSingle();
  if (!program) notFound();

  const { data: enrollment } = await supabase.from("enrollments").select("id").eq("user_id", user.id).eq("program_id", program.id).maybeSingle();
  if (!enrollment) notFound();

  const { data: profileRow } = await supabase.from("mentorship_profiles").select("*").eq("enrollment_id", enrollment.id).maybeSingle();
  const profile = profileRow as MentorshipProfile | null;
  const effectiveStatus = profile ? getEffectiveMentorshipStatus(profile) : "active";
  const isActive = effectiveStatus === "active";

  const progress = isActive ? await getProgressData(supabase, enrollment.id) : null;

  return (
    <div>
      <Link href={`/dashboard/mentorship/${slug}`} className="mb-6 inline-flex items-center text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="mr-1 h-3.5 w-3.5" />
        Back to dashboard
      </Link>

      {!isActive || !progress ? (
        <p className="text-sm text-ink-500">Your progress journey will be available once your mentorship access is active.</p>
      ) : (
        <>
          {/* 1. HEADER */}
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">
            {progress.mentorshipJourney.weeksInMentorship != null
              ? `Week ${progress.mentorshipJourney.weeksInMentorship} of your mentorship`
              : "Your mentorship journey"}
          </h1>
          {progress.mentorshipJourney.joinDateIso && (
            <p className="mt-1 text-sm text-ink-500">Joined {formatDate(progress.mentorshipJourney.joinDateIso)}</p>
          )}

          {/* 2. YOUR JOURNEY */}
          <section className="mt-8 border border-ink-300 p-5">
            <h2 className="font-display text-lg font-semibold text-ink-900">Your journey</h2>
            {progress.productTimelines.length === 0 ? (
              <p className="mt-3 text-sm text-ink-500">Once a product has been evaluated, its journey will show up here.</p>
            ) : (
              <div className="mt-4 space-y-5">
                {progress.productTimelines.map((timeline) => (
                  <div key={timeline.productId}>
                    <p className="font-medium text-ink-900">{timeline.productName}</p>
                    <div className="mt-2 space-y-1.5 border-l-2 border-ink-300 pl-4">
                      {timeline.entries.map((entry, i) => (
                        <div key={i} className="text-sm">
                          <span className="font-medium text-ink-900">{entry.decision.replace(/_/g, " ")}</span>
                          <span className="ml-2 text-ink-500">{formatDate(entry.effectiveAt)}</span>
                          {entry.isOverride && (
                            <Badge tone="brand" className="ml-2">
                              MENTOR OVERRIDE
                            </Badge>
                          )}
                          <span className="ml-2 text-xs text-ink-500">
                            {entry.ongoing ? `${entry.daysInState} day${entry.daysInState === 1 ? "" : "s"} so far` : `${entry.daysInState} day${entry.daysInState === 1 ? "" : "s"}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 3. WHAT'S IMPROVED */}
          <section className="mt-6 border border-ink-300 p-5">
            <h2 className="font-display text-lg font-semibold text-ink-900">What&apos;s improved</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <ComparisonCard comparison={progress.currentWeekComparison} />
              <ComparisonCard comparison={progress.rolling30dComparison} />
            </div>
            {progress.sinceJoining ? (
              <div className="mt-3 border border-ink-300 p-4">
                <p className="font-medium text-ink-900">Since {formatDate(progress.sinceJoining.dataAvailableFromIso)}</p>
                {progress.sinceJoining.truncated && (
                  <p className="mt-1 text-xs text-ink-500">Data available from this date — earlier history wasn&apos;t connected yet.</p>
                )}
                <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <p className="font-mono text-[11px] uppercase text-ink-500">Revenue</p>
                    <p className="text-ink-900">{formatMinor(progress.sinceJoining.economics.totalRevenue)}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[11px] uppercase text-ink-500">Orders</p>
                    <p className="text-ink-900">{progress.sinceJoining.economics.totalOrders}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[11px] uppercase text-ink-500">Delivered</p>
                    <p className="text-ink-900">{progress.sinceJoining.economics.totalDelivered}</p>
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
              <p className="mt-3 text-sm text-ink-500">Not enough history yet to show totals since joining.</p>
            )}
          </section>

          {/* 4. WHAT STILL NEEDS WORK */}
          <section className="mt-6 border border-ink-300 p-5">
            <h2 className="font-display text-lg font-semibold text-ink-900">What still needs work</h2>
            {progress.primaryBottleneck ? (
              <div className="mt-3">
                <p className="font-medium text-ink-900">
                  {progress.primaryBottleneck.productName ? `${progress.primaryBottleneck.productName}: ` : ""}
                  {progress.primaryBottleneck.what}
                </p>
                <p className="mt-1 text-sm text-ink-700">{progress.primaryBottleneck.why}</p>
                <p className="mt-1 text-sm text-ink-800">→ {progress.primaryBottleneck.nextAction}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-500">No urgent business issue right now.</p>
            )}
          </section>

          {/* 5. EXECUTION HISTORY */}
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
            {progress.executionHistory.overdueNow > 0 && (
              <p className="mt-3 text-sm text-danger">{progress.executionHistory.overdueNow} task(s) overdue right now.</p>
            )}
          </section>

          {/* 6. MENTOR DIRECTION HISTORY */}
          <section className="mt-6 border border-ink-300 p-5">
            <h2 className="font-display text-lg font-semibold text-ink-900">Mentor direction history</h2>
            {progress.mentorshipJourney.directionHistory.length === 0 ? (
              <p className="mt-3 text-sm text-ink-500">No direction has been set yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {[...progress.mentorshipJourney.directionHistory].reverse().map((entry, i) => (
                  <div key={i} className="border-l-2 border-brand-400/50 pl-3">
                    <p className="text-sm text-ink-800">{entry.note}</p>
                    <p className="mt-0.5 font-mono text-xs text-ink-500">{formatDate(entry.setAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
