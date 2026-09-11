import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPrice } from "@/lib/utils";
import { getEffectiveMentorshipStatus, getRemainingDays } from "@/lib/mentorship-access";
import { getWeeklyFocusTasks } from "@/lib/tasks/focus";
import { getAccountIntelligence } from "@/lib/health/runner";
import { resolveDateRange, DEFAULT_DATE_RANGE_PRESET } from "@/lib/products/date-range";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskStatusToggle } from "@/components/mentorship/task-status-toggle";
import { RefreshFocusButton } from "@/components/mentorship/refresh-focus-button";
import { ArrowLeft, CalendarClock } from "lucide-react";
import type { AccountHealthStatus } from "@/lib/health/types";
import type { MentorshipPayment, MentorshipProfile, ProductDecisionState } from "@/types/database";

type MentorshipCallRow = {
  id: string;
  scheduled_at: string;
  status: string;
  meeting_link: string | null;
  recording_url: string | null;
  call_notes: string | null;
};

type MentorshipNoteRow = {
  id: string;
  note: string;
  created_at: string;
};

type ProgramResourceRow = {
  id: string;
  name: string;
  file_path: string;
  file_type: string | null;
};

interface Props {
  params: Promise<{ slug: string }>;
}

const STATUS_TONE = {
  active: "success",
  paused: "warning",
  revoked: "warning",
  expired: "neutral",
} as const;

const STATUS_LABEL = {
  active: "ACTIVE",
  paused: "PAUSED",
  revoked: "ACCESS REVOKED",
  expired: "EXPIRED",
} as const;

const DECISION_TONE: Record<ProductDecisionState, "success" | "warning" | "neutral" | "brand"> = {
  SCALE: "success",
  RELAUNCH: "brand",
  ITERATE: "warning",
  WATCH: "neutral",
  TEST: "neutral",
  DATA_NEEDED: "warning",
  KILL: "warning",
};

const PRIORITY_TONE = { high: "warning", medium: "neutral", low: "neutral" } as const;

const HEALTH_TONE: Record<AccountHealthStatus, "success" | "warning" | "neutral"> = {
  HEALTHY: "success",
  AT_RISK: "warning",
  CRITICAL: "warning",
  INSUFFICIENT_DATA: "neutral",
};

const HEALTH_LABEL: Record<AccountHealthStatus, string> = {
  HEALTHY: "HEALTHY",
  AT_RISK: "AT RISK",
  CRITICAL: "CRITICAL",
  INSUFFICIENT_DATA: "INSUFFICIENT DATA",
};

function formatMinorOrDash(minor: number | null | undefined): string {
  return minor != null ? `₹${(minor / 100).toFixed(2)}` : "—";
}

function firstName(fullName: string | null | undefined): string {
  if (!fullName) return "there";
  return fullName.trim().split(/\s+/)[0] ?? "there";
}

export default async function MentorshipDashboardPage({ params }: Props) {
  const { slug } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: program } = await supabase
    .from("programs")
    .select("id, slug, title")
    .eq("slug", slug)
    .eq("type_id", "mentorship")
    .maybeSingle();
  if (!program) notFound();

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", user.id)
    .eq("program_id", program.id)
    .maybeSingle();
  if (!enrollment) notFound();

  // Readable regardless of access status — a paused/revoked student must
  // still be able to see their own status and payment history.
  const [{ data: profileRow }, { data: paymentRows }] = await Promise.all([
    supabase.from("mentorship_profiles").select("*").eq("enrollment_id", enrollment.id).maybeSingle(),
    supabase.from("mentorship_payments").select("*").eq("enrollment_id", enrollment.id).order("due_date", { ascending: true }),
  ]);

  const profile = profileRow as MentorshipProfile | null;
  const payments = (paymentRows ?? []) as MentorshipPayment[];
  const effectiveStatus = profile ? getEffectiveMentorshipStatus(profile) : "active";
  const remainingDays = profile ? getRemainingDays(profile) : null;
  const isActive = effectiveStatus === "active";
  const nextPendingPayment = payments.find((p) => p.status !== "paid");

  // Mentorship content itself is only fetched when access is active — RLS
  // (is_mentorship_access_active) would return empty rows anyway once
  // paused/revoked/expired, but skipping the queries keeps this render path
  // simple and avoids showing misleading "no data yet" empty states.
  const range = resolveDateRange(DEFAULT_DATE_RANGE_PRESET);
  const [{ data: calls }, { data: notes }, { data: resources }, weeklyFocus, intelligence] = isActive
    ? await Promise.all([
        supabase
          .from("mentorship_calls")
          .select("id, scheduled_at, status, meeting_link, recording_url, call_notes")
          .eq("enrollment_id", enrollment.id)
          .order("scheduled_at", { ascending: false }),
        supabase
          .from("mentorship_notes")
          .select("id, note, created_at")
          .eq("enrollment_id", enrollment.id)
          .eq("is_mentor_direction", true)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("program_resources")
          .select("id, name, file_path, file_type")
          .eq("program_id", program.id)
          .order("position", { ascending: true }),
        getWeeklyFocusTasks(supabase, enrollment.id),
        getAccountIntelligence(supabase, enrollment.id, range),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, [], null];

  const portfolio = intelligence?.portfolio ?? [];
  const snapshot = intelligence?.economics ?? null;

  const enrollmentCalls = (calls ?? []) as MentorshipCallRow[];
  const enrollmentNotes = (notes ?? []) as MentorshipNoteRow[];
  const enrollmentResources = (resources ?? []) as ProgramResourceRow[];
  const latestNote = enrollmentNotes[0] ?? null;
  const upcomingCall = enrollmentCalls
    .filter((c) => new Date(c.scheduled_at) >= new Date())
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];

  return (
    <div>
      <Link href="/dashboard" className="mb-6 inline-flex items-center text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="mr-1 h-3.5 w-3.5" />
        Back to dashboard
      </Link>

      {/* 1. HEADER / CURRENT STATE */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">
            Hey {firstName(user.profile.full_name)} — {program.title}
          </h1>
          {profile && (
            <p className="mt-1 text-sm text-ink-500">
              Stage: <span className="text-ink-700">{profile.current_stage || "Not set"}</span>
              {profile.current_objective ? ` · ${profile.current_objective}` : ""}
            </p>
          )}
        </div>
        {profile && (
          <div className="text-right">
            <Badge tone={STATUS_TONE[effectiveStatus]}>{STATUS_LABEL[effectiveStatus]}</Badge>
            {remainingDays !== null && (effectiveStatus === "active" || effectiveStatus === "paused") && (
              <p className="mt-1 font-mono text-xs text-ink-500">{remainingDays} day{remainingDays === 1 ? "" : "s"} remaining</p>
            )}
          </div>
        )}
      </div>

      {effectiveStatus === "paused" && (
        <p className="mt-3 rounded-md border border-ink-300 bg-ink-100 p-3 text-sm text-ink-700">
          Your mentorship access is paused. Your remaining days are preserved and access resumes once your mentor reactivates it.
        </p>
      )}
      {effectiveStatus === "revoked" && (
        <p className="mt-3 rounded-md border border-ink-300 bg-ink-100 p-3 text-sm text-ink-700">
          Your mentorship access has been revoked. Contact your mentor for details.
        </p>
      )}
      {effectiveStatus === "expired" && (
        <p className="mt-3 rounded-md border border-ink-300 bg-ink-100 p-3 text-sm text-ink-700">
          Your mentorship period has ended. Contact your mentor if you&apos;d like to renew.
        </p>
      )}

      {isActive && (
        <>
          <div className="mt-4 flex flex-wrap gap-4 font-mono text-xs uppercase tracking-wide text-ink-500">
            <Link href={`/dashboard/mentorship/${slug}/connections`} className="hover:text-ink-900">
              Connections
            </Link>
            <Link href={`/dashboard/mentorship/${slug}/products`} className="hover:text-ink-900">
              Products
            </Link>
            <Link href={`/dashboard/mentorship/${slug}/shipping`} className="hover:text-ink-900">
              Fulfillment data
            </Link>
            <Link href={`/dashboard/mentorship/${slug}/progress`} className="hover:text-ink-900">
              Progress
            </Link>
          </div>

          {/* PRIMARY BUSINESS FOCUS — context above execution, kept compact */}
          {intelligence && (
            <section className="mt-6 border border-ink-300 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-lg font-semibold text-ink-900">Primary business focus</h2>
                <Badge tone={HEALTH_TONE[intelligence.health.status]}>{HEALTH_LABEL[intelligence.health.status]}</Badge>
              </div>

              {intelligence.bottlenecks.length === 0 ? (
                <p className="mt-3 text-sm text-ink-500">No urgent business issue right now — keep executing this week&apos;s focus below.</p>
              ) : (
                <div className="mt-3">
                  <p className="font-display text-base font-semibold text-ink-900">
                    {intelligence.bottlenecks[0]!.productName ? `${intelligence.bottlenecks[0]!.productName}: ` : ""}
                    {intelligence.bottlenecks[0]!.what}
                  </p>
                  <p className="mt-1.5 text-sm text-ink-700">{intelligence.bottlenecks[0]!.why}</p>
                  <p className="mt-1 text-sm text-ink-800">
                    <span className="font-medium">→</span> {intelligence.bottlenecks[0]!.nextAction}
                  </p>
                </div>
              )}

              {intelligence.health.status !== "HEALTHY" && (
                <ul className="mt-3 space-y-1 border-t border-ink-300 pt-3 text-xs text-ink-500">
                  {intelligence.health.reasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* 2. THIS WEEK'S FOCUS — the dominant section */}
          <section className="mt-8 border-2 border-ink-900 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl font-bold tracking-tight text-ink-900">This week&apos;s focus</h2>
                <p className="mt-1 text-sm text-ink-500">What to actually do — in priority order.</p>
              </div>
              <RefreshFocusButton enrollmentId={enrollment.id} />
            </div>

            {weeklyFocus.length === 0 ? (
              <p className="mt-4 text-sm text-ink-500">
                Nothing on your plate right now. Click Refresh to check for new priorities, or connect Shopify/Meta to get started.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {weeklyFocus.map((task) => (
                  <div key={task.id} className="flex gap-3 border border-ink-300 p-4">
                    <TaskStatusToggle enrollmentId={enrollment.id} taskId={task.id} status={task.status} />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={PRIORITY_TONE[task.priority]}>{task.priority.toUpperCase()}</Badge>
                        <p className={`font-display text-base font-semibold ${task.status === "DONE" ? "text-ink-500 line-through" : "text-ink-900"}`}>
                          {task.title}
                        </p>
                      </div>
                      {task.why && <p className="mt-1.5 text-sm text-ink-700">{task.why}</p>}
                      {task.next_action && (
                        <p className="mt-1 text-sm text-ink-800">
                          <span className="font-medium">→</span> {task.next_action}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-3 font-mono text-[11px] uppercase text-ink-500">
                        {task.due_date && <span>Due {formatDate(task.due_date)}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 3. BUSINESS SNAPSHOT */}
          <section className="mt-6 border border-ink-300 p-5">
            <h2 className="font-display text-lg font-semibold text-ink-900">Business snapshot</h2>
            <p className="mt-1 text-sm text-ink-500">{range.label}.</p>
            {!snapshot || snapshot.productsIncluded === 0 ? (
              <p className="mt-4 text-sm text-ink-500">No active products yet — add one to start tracking your numbers.</p>
            ) : (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <Metric label="Revenue" value={formatMinorOrDash(snapshot.totalRevenue)} />
                  <Metric label="Ad spend" value={formatMinorOrDash(snapshot.totalAdSpend)} />
                  <Metric label="Orders" value={snapshot.totalOrders} />
                  <Metric label="Delivered" value={snapshot.totalDelivered} />
                  <Metric label="RTO" value={snapshot.totalRto} />
                  <Metric
                    label="Contribution profit"
                    value={snapshot.totalContributionProfit != null ? formatMinorOrDash(snapshot.totalContributionProfit) : "Incomplete"}
                  />
                </div>
                {snapshot.productsWithIncompleteEconomics > 0 && (
                  <p className="mt-3 text-xs text-ink-500">
                    {snapshot.productsWithIncompleteEconomics} of {snapshot.productsIncluded} product
                    {snapshot.productsIncluded === 1 ? "" : "s"} {snapshot.productsWithIncompleteEconomics === 1 ? "has" : "have"} incomplete economics —
                    contribution profit above excludes {snapshot.productsWithIncompleteEconomics === 1 ? "it" : "them"} rather than guessing.
                  </p>
                )}
              </>
            )}
          </section>

          {/* 4. PRODUCT PORTFOLIO */}
          <section className="mt-6 border border-ink-300 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink-900">Product portfolio</h2>
              <Link href={`/dashboard/mentorship/${slug}/products`} className="text-sm text-brand-300 underline">
                View all products
              </Link>
            </div>
            {intelligence && intelligence.insights.length > 0 && intelligence.insights[0]!.kind !== "NO_ACTIVE_PRODUCTS" && (
              <ul className="mt-2 space-y-1 text-sm text-ink-700">
                {intelligence.insights.map((insight, i) => (
                  <li key={i}>• {insight.text}</li>
                ))}
              </ul>
            )}
            {portfolio.length === 0 ? (
              <p className="mt-3 text-sm text-ink-500">No active products yet.</p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {portfolio.map((entry) => (
                  <Link
                    key={entry.product.id}
                    href={`/dashboard/mentorship/${slug}/products/${entry.product.id}`}
                    className="block border border-ink-300 p-4 hover:border-ink-400"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-ink-900">{entry.product.name}</p>
                      {entry.effectiveDecision ? (
                        <Badge tone={DECISION_TONE[entry.effectiveDecision]}>{entry.effectiveDecision.replace("_", " ")}</Badge>
                      ) : (
                        <Badge tone="neutral">Not evaluated</Badge>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-ink-500">
                      <span>ROAS: {entry.blendedRoas != null ? `${entry.blendedRoas.toFixed(2)}x` : "—"}</span>
                      <span>Break-even: {entry.breakEvenRoas != null ? `${entry.breakEvenRoas.toFixed(2)}x` : "—"}</span>
                      <span>Profit: {entry.contributionProfit != null ? formatMinorOrDash(entry.contributionProfit) : "—"}</span>
                      <span>RTO: {entry.rtoRate != null ? `${entry.rtoRate.toFixed(1)}%` : "—"}</span>
                    </div>
                    {entry.latestDecision?.next_action && !entry.isOverridden && (
                      <p className="mt-2 text-sm text-ink-700">→ {entry.latestDecision.next_action}</p>
                    )}
                    {entry.isOverridden && entry.activeOverride && (
                      <p className="mt-2 text-sm text-brand-300">Mentor override: {entry.activeOverride.override_decision.replace("_", " ")}</p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* 5. NEXT MENTOR CALL */}
          <section className="mt-6 border border-ink-300 p-5">
            <div className="mb-2 flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-ink-500" />
              <h2 className="font-display text-lg font-semibold text-ink-900">Next mentor call</h2>
            </div>
            {upcomingCall ? (
              <div>
                <p className="font-medium text-ink-900">{formatDate(upcomingCall.scheduled_at)}</p>
                <p className="mt-1 font-mono text-xs uppercase text-ink-500">{upcomingCall.status}</p>
                {upcomingCall.meeting_link ? (
                  <a href={upcomingCall.meeting_link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block">
                    <Button size="sm" variant="outline">
                      Join link
                    </Button>
                  </a>
                ) : (
                  <p className="mt-2 text-sm text-ink-500">No meeting link yet.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink-500">No upcoming call scheduled.</p>
            )}
          </section>

          {/* 6. MENTOR DIRECTION */}
          <section className="mt-6 border border-ink-300 p-5">
            <h2 className="font-display text-lg font-semibold text-ink-900">Mentor direction</h2>
            {latestNote ? (
              <div className="mt-3">
                <p className="text-sm text-ink-800">{latestNote.note}</p>
                <p className="mt-1 font-mono text-xs text-ink-500">{formatDate(latestNote.created_at)}</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-500">No mentor direction yet.</p>
            )}
          </section>
        </>
      )}

      {/* 7. MEMBERSHIP / PAYMENTS */}
      <div className="mt-6 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Membership</h2>
        <div className="mt-3 space-y-3">
          {payments.length === 0 ? (
            <p className="text-sm text-ink-500">No payments recorded yet.</p>
          ) : nextPendingPayment ? (
            <div>
              <p className="font-medium text-ink-900">
                {formatPrice(nextPendingPayment.amount, nextPendingPayment.currency)} due on {formatDate(nextPendingPayment.due_date)}
              </p>
              <p className="mt-1 font-mono text-xs text-ink-500">{nextPendingPayment.status === "overdue" ? "Payment overdue" : "Payment pending"}</p>
              <div className="mt-2">
                {nextPendingPayment.razorpay_link ? (
                  <a href={nextPendingPayment.razorpay_link} target="_blank" rel="noopener noreferrer">
                    <Button size="sm">Pay Now</Button>
                  </a>
                ) : (
                  <p className="text-sm text-ink-500">Payment link will be added soon.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-success">All payments up to date.</p>
          )}
        </div>
      </div>

      {/* 8. RESOURCES */}
      {isActive && (
        <section className="mt-6 border border-ink-300 p-5">
          <h2 className="mb-3 font-display text-lg font-semibold text-ink-900">Resources</h2>
          {enrollmentResources.length === 0 ? (
            <p className="text-sm text-ink-500">No resources available yet.</p>
          ) : (
            <div className="space-y-2">
              {enrollmentResources.map((resource) => (
                <div key={resource.id} className="rounded-md border border-ink-300 p-3">
                  <p className="font-medium text-ink-900">{resource.name}</p>
                  <p className="font-mono text-xs text-ink-500">
                    {resource.file_type ? `${resource.file_type} · ` : ""}/{resource.file_path}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-ink-300 p-3">
      <p className="font-mono text-[11px] uppercase text-ink-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink-900">{value}</p>
    </div>
  );
}
