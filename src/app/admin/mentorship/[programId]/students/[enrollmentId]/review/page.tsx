import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { getEffectiveMentorshipStatus, getRemainingDays } from "@/lib/mentorship-access";
import { getMentorReviewData } from "@/lib/review/runner";
import { resolveDateRange, DEFAULT_DATE_RANGE_PRESET } from "@/lib/products/date-range";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { MentorTaskForm } from "@/components/admin/mentor-task-form";
import { MentorTaskRow } from "@/components/admin/mentor-task-row";
import { GenerateTasksButton } from "@/components/admin/generate-tasks-button";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { addMentorshipCall, addMentorshipNote, updateMentorshipCall } from "../actions";
import type { AccountHealthStatus } from "@/lib/health/types";
import type { MentorshipCall, MentorshipProductCatalog, MentorshipProfile } from "@/types/database";

interface Props {
  params: Promise<{ programId: string; enrollmentId: string }>;
  searchParams: Promise<{ callId?: string }>;
}

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
const STATUS_TONE = { active: "success", paused: "warning", revoked: "warning", expired: "neutral" } as const;
const KNOWN_CALL_STATUSES = ["scheduled", "completed", "cancelled"];

function toInputDateTime(date: string) {
  return new Date(date).toISOString().slice(0, 16);
}
function nowInputDateTime() {
  return new Date().toISOString().slice(0, 16);
}

export default async function MentorReviewPage({ params, searchParams }: Props) {
  const { programId, enrollmentId } = await params;
  const { callId } = await searchParams;
  await requireAdmin();
  const supabase = await createClient();

  const { data: program } = await supabase.from("programs").select("id, slug, title").eq("id", programId).eq("type_id", "mentorship").maybeSingle();
  if (!program) notFound();

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, user_id, profiles(full_name)")
    .eq("id", enrollmentId)
    .eq("program_id", program.id)
    .maybeSingle();
  if (!enrollment) notFound();

  const range = resolveDateRange(DEFAULT_DATE_RANGE_PRESET);

  const [{ data: studentProfileRow }, { data: mentorProfileRow }, { data: callRows }, { data: catalogRows }, reviewData] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", enrollment.user_id).single(),
    supabase.from("mentorship_profiles").select("*").eq("enrollment_id", enrollment.id).maybeSingle(),
    supabase.from("mentorship_calls").select("*").eq("enrollment_id", enrollment.id).order("scheduled_at", { ascending: false }),
    supabase.from("mentorship_product_catalog").select("*").eq("enrollment_id", enrollment.id).order("created_at", { ascending: false }),
    getMentorReviewData(supabase, enrollment.id, range),
  ]);

  const studentName = (studentProfileRow as { full_name: string | null } | null)?.full_name ?? "Unnamed Student";
  const mentorProfile = mentorProfileRow as MentorshipProfile | null;
  const calls = (callRows ?? []) as MentorshipCall[];
  const catalogProducts = (catalogRows ?? []) as MentorshipProductCatalog[];
  const catalogProductOptions = catalogProducts.map((p) => ({ id: p.id, name: p.name }));

  const effectiveStatus = mentorProfile ? getEffectiveMentorshipStatus(mentorProfile) : "active";
  const remainingDays = mentorProfile ? getRemainingDays(mentorProfile) : null;

  const now = new Date();
  const upcomingCall = [...calls].filter((c) => new Date(c.scheduled_at) >= now).sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];
  const defaultCall = upcomingCall ?? calls[0] ?? null;
  const isCreatingNew = callId === "new";
  const selectedCall = !isCreatingNew && callId ? (calls.find((c) => c.id === callId) ?? defaultCall) : isCreatingNew ? null : defaultCall;

  const primaryBottleneck = reviewData.bottlenecks[0] ?? null;
  const discussionProducts = reviewData.productsForReview.slice(0, 6);
  const backHref = `/admin/mentorship/${program.id}/students/${enrollment.id}`;

  return (
    <div>
      <Link href={backHref} className="mb-5 inline-flex items-center text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="mr-1 h-3.5 w-3.5" />
        Back to workspace
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Mentor review</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink-900">{studentName}</h1>
          <p className="mt-1 text-sm text-ink-500">{program.title}</p>
        </div>
        <Link href={`/admin/mentorship/${program.id}/students/${enrollment.id}/progress`} className="text-sm text-brand-300 underline">
          View longitudinal progress →
        </Link>
      </div>

      {/* 1. STUDENT OVERVIEW */}
      <section className="mt-6 grid grid-cols-2 gap-3 border border-ink-300 p-5 sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <p className="font-mono text-[11px] uppercase text-ink-500">Status</p>
          <Badge tone={STATUS_TONE[effectiveStatus]}>{effectiveStatus.toUpperCase()}</Badge>
        </div>
        <div>
          <p className="font-mono text-[11px] uppercase text-ink-500">Days remaining</p>
          <p className="mt-1 font-semibold text-ink-900">{remainingDays ?? "—"}</p>
        </div>
        <div>
          <p className="font-mono text-[11px] uppercase text-ink-500">Stage</p>
          <p className="mt-1 font-semibold text-ink-900">{mentorProfile?.current_stage || "Not set"}</p>
        </div>
        <div>
          <p className="font-mono text-[11px] uppercase text-ink-500">Next call</p>
          <p className="mt-1 font-semibold text-ink-900">{upcomingCall ? formatDate(upcomingCall.scheduled_at) : "None scheduled"}</p>
        </div>
        <div className="col-span-2">
          <p className="font-mono text-[11px] uppercase text-ink-500">Account health</p>
          <Badge tone={HEALTH_TONE[reviewData.health.status]}>{HEALTH_LABEL[reviewData.health.status]}</Badge>
        </div>
      </section>

      {/* 2. WHAT CHANGED */}
      <section className="mt-6 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">What changed</h2>
        <p className="mt-1 text-sm text-ink-500">Since the last completed call ({formatDate(reviewData.reviewCutoffIso)}).</p>
        {reviewData.changes.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">No meaningful changes since the last review.</p>
        ) : (
          <ul className="mt-3 space-y-1.5 text-sm text-ink-700">
            {reviewData.changes.map((change, i) => (
              <li key={i}>• {change.detail}</li>
            ))}
          </ul>
        )}
        <div className="mt-3 border-t border-ink-300 pt-3">
          <p className="font-mono text-[11px] uppercase text-ink-500">Latest mentor override</p>
          {reviewData.latestOverride ? (
            <p className="mt-1 text-sm text-ink-700">
              {reviewData.latestOverride.productName}: {reviewData.latestOverride.decision.replace("_", " ")} — &quot;{reviewData.latestOverride.reason}&quot; (
              {formatDate(reviewData.latestOverride.createdAt)})
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-500">No overrides yet.</p>
          )}
        </div>
      </section>

      {/* 3. PORTFOLIO */}
      <section className="mt-6 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Portfolio — products requiring attention</h2>
        {reviewData.insights.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-ink-700">
            {reviewData.insights.map((insight, i) => (
              <li key={i}>• {insight.text}</li>
            ))}
          </ul>
        )}
        {discussionProducts.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">No product currently needs discussion.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {discussionProducts.map(({ bottleneck, changes }) => {
              const entry = reviewData.portfolio.find((p) => p.product.id === bottleneck.productId);
              return (
                <div key={bottleneck.productId} className="border border-ink-300 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-ink-900">{bottleneck.productName}</p>
                    <Badge tone="neutral">{bottleneck.level.replace(/_/g, " ")}</Badge>
                  </div>
                  {entry && (
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-ink-500 sm:grid-cols-4">
                      <span>ROAS: {entry.blendedRoas != null ? `${entry.blendedRoas.toFixed(2)}x` : "—"}</span>
                      <span>Break-even: {entry.breakEvenRoas != null ? `${entry.breakEvenRoas.toFixed(2)}x` : "—"}</span>
                      <span>Profit: {entry.contributionProfit != null ? formatCurrency(entry.contributionProfit, "INR") : "—"}</span>
                      <span>RTO: {entry.rtoRate != null ? `${entry.rtoRate.toFixed(1)}%` : "—"}</span>
                    </div>
                  )}
                  <p className="mt-2 text-sm text-ink-700">{bottleneck.why}</p>
                  <p className="mt-1 text-sm text-ink-800">→ {bottleneck.nextAction}</p>
                  {entry?.isOverridden && entry.activeOverride && (
                    <p className="mt-1 text-sm text-brand-300">Mentor override: {entry.activeOverride.override_decision.replace("_", " ")}</p>
                  )}
                  {changes.length > 0 && (
                    <ul className="mt-2 space-y-0.5 border-t border-ink-300 pt-2 text-xs text-ink-500">
                      {changes.map((c, i) => (
                        <li key={i}>• {c.detail}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. EXECUTION */}
      <section className="mt-6 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Execution — did the student act?</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="font-mono text-[11px] uppercase text-ink-500">Completed</p>
            <p className="mt-1 font-semibold text-ink-900">{reviewData.execution.completedSinceCutoff.length}</p>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase text-ink-500">Skipped</p>
            <p className="mt-1 font-semibold text-ink-900">{reviewData.execution.skippedSinceCutoff.length}</p>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase text-ink-500">Open</p>
            <p className="mt-1 font-semibold text-ink-900">{reviewData.execution.openTasks.length}</p>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase text-ink-500">Overdue</p>
            <p className="mt-1 font-semibold text-ink-900">{reviewData.execution.overdueTasks.length}</p>
          </div>
        </div>
        {reviewData.execution.completionRate != null && (
          <p className="mt-2 text-sm text-ink-700">Completion rate since last call: {(reviewData.execution.completionRate * 100).toFixed(0)}%</p>
        )}
        {reviewData.execution.completedSinceCutoff.length > 0 && (
          <div className="mt-3 border-t border-ink-300 pt-3">
            <p className="mb-1 font-mono text-[11px] uppercase text-ink-500">Completed since last call</p>
            <ul className="space-y-1 text-sm text-ink-700">
              {reviewData.execution.completedSinceCutoff.map((t) => (
                <li key={t.id}>✓ {t.title}</li>
              ))}
            </ul>
          </div>
        )}
        {reviewData.execution.overdueTasks.length > 0 && (
          <div className="mt-3 border-t border-ink-300 pt-3">
            <p className="mb-1 font-mono text-[11px] uppercase text-ink-500">Overdue right now</p>
            <ul className="space-y-1 text-sm text-danger">
              {reviewData.execution.overdueTasks.map((t) => (
                <li key={t.id}>
                  {t.title} — due {t.due_date ? formatDate(t.due_date) : "—"}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 5. MENTOR NOTES */}
      <section className="mt-6 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Mentor notes</h2>
        <div className="mt-3">
          <p className="font-mono text-[11px] uppercase text-ink-500">Active mentor direction</p>
          {reviewData.notes.latestDirection ? (
            <div className="mt-1 border border-brand-400/40 p-3">
              <p className="text-sm text-ink-800">{reviewData.notes.latestDirection.note}</p>
              <p className="mt-1 font-mono text-xs text-ink-500">{formatDate(reviewData.notes.latestDirection.created_at)}</p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-ink-500">No direction set yet.</p>
          )}
        </div>
        {reviewData.notes.sinceLastCall.length > 0 && (
          <div className="mt-3 border-t border-ink-300 pt-3">
            <p className="mb-1 font-mono text-[11px] uppercase text-ink-500">Since the last call</p>
            <div className="space-y-2">
              {reviewData.notes.sinceLastCall.map((n) => (
                <div key={n.id} className="text-sm text-ink-700">
                  {n.is_mentor_direction && <Badge tone="brand">DIRECTION</Badge>} {n.note}
                  <span className="ml-2 font-mono text-xs text-ink-500">{formatDate(n.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {reviewData.notes.historical.length > 0 && (
          <div className="mt-3 border-t border-ink-300 pt-3">
            <p className="mb-1 font-mono text-[11px] uppercase text-ink-500">Historical ({reviewData.notes.historical.length})</p>
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {reviewData.notes.historical.slice(0, 10).map((n) => (
                <div key={n.id} className="text-sm text-ink-500">
                  {n.is_mentor_direction && <Badge tone="neutral">was direction</Badge>} {n.note}
                  <span className="ml-2 font-mono text-xs">{formatDate(n.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 6. CALL PREP */}
      <section className="mt-6 border-2 border-ink-900 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Call prep</h2>
        <div className="mt-3 space-y-3 text-sm">
          <p>
            <span className="font-mono text-[11px] uppercase text-ink-500">1. Account health — </span>
            <Badge tone={HEALTH_TONE[reviewData.health.status]}>{HEALTH_LABEL[reviewData.health.status]}</Badge>
            {reviewData.health.status !== "HEALTHY" && (
              <span className="ml-2 text-ink-700">{reviewData.health.reasons.join(" ")}</span>
            )}
          </p>
          <p>
            <span className="font-mono text-[11px] uppercase text-ink-500">2. Primary business bottleneck — </span>
            {primaryBottleneck ? (
              <span className="text-ink-700">
                {primaryBottleneck.productName ? `${primaryBottleneck.productName}: ` : ""}
                {primaryBottleneck.what}
              </span>
            ) : (
              <span className="text-ink-500">None right now.</span>
            )}
          </p>
          <p>
            <span className="font-mono text-[11px] uppercase text-ink-500">3. Biggest opportunity — </span>
            {reviewData.biggestOpportunity ? (
              <span className="text-ink-700">
                {reviewData.biggestOpportunity.productName}: {reviewData.biggestOpportunity.what}
              </span>
            ) : (
              <span className="text-ink-500">None identified this period.</span>
            )}
          </p>
          <div>
            <span className="font-mono text-[11px] uppercase text-ink-500">4. Products to discuss — </span>
            {discussionProducts.length === 0 ? (
              <span className="text-ink-500">None.</span>
            ) : (
              <span className="text-ink-700">{discussionProducts.map((p) => p.bottleneck.productName).join(", ")}</span>
            )}
          </div>
          <p>
            <span className="font-mono text-[11px] uppercase text-ink-500">5. Execution — </span>
            <span className="text-ink-700">
              {reviewData.execution.completedSinceCutoff.length} completed, {reviewData.execution.skippedSinceCutoff.length} skipped,{" "}
              {reviewData.execution.overdueTasks.length} overdue since last call.
            </span>
          </p>
          <p>
            <span className="font-mono text-[11px] uppercase text-ink-500">6. Meaningful changes — </span>
            <span className="text-ink-700">{reviewData.changes.length === 0 ? "None since the last review." : `${reviewData.changes.length} change(s) — see “What changed” above.`}</span>
          </p>
        </div>
      </section>

      {/* 7. CURRENT CALL */}
      <section className="mt-6 border border-ink-300 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center">
            <CalendarClock className="mr-2 h-4 w-4 text-ink-500" />
            <h2 className="font-display text-lg font-semibold text-ink-900">Current call</h2>
          </div>
        </div>

        {calls.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {calls.map((c) => (
              <Link
                key={c.id}
                href={`?callId=${c.id}`}
                className={`rounded-md border px-2.5 py-1 font-mono text-xs uppercase ${
                  selectedCall?.id === c.id ? "border-ink-900 text-ink-900" : "border-ink-300 text-ink-500 hover:border-ink-400"
                }`}
              >
                {formatDate(c.scheduled_at)} · {c.status}
              </Link>
            ))}
            <Link
              href="?callId=new"
              className={`rounded-md border px-2.5 py-1 font-mono text-xs uppercase ${
                isCreatingNew ? "border-ink-900 text-ink-900" : "border-ink-300 text-ink-500 hover:border-ink-400"
              }`}
            >
              + New call
            </Link>
          </div>
        )}

        {selectedCall ? (
          <form action={updateMentorshipCall.bind(null, program.id, enrollment.id)} className="grid gap-3">
            <input type="hidden" name="call_id" value={selectedCall.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Scheduled</Label>
                <Input name="scheduled_at" type="datetime-local" defaultValue={toInputDateTime(selectedCall.scheduled_at)} required />
              </div>
              <div>
                <Label>Status</Label>
                <select name="status" defaultValue={selectedCall.status} className="h-10 w-full rounded-md border border-ink-300 bg-ink-100 px-3 text-sm text-ink-900">
                  {!KNOWN_CALL_STATUSES.includes(selectedCall.status) && <option value={selectedCall.status}>{selectedCall.status} (legacy)</option>}
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <Input name="meeting_link" placeholder="Meeting link" defaultValue={selectedCall.meeting_link ?? ""} />
            <div>
              <Label>Call notes (summary, observations, decisions, follow-ups)</Label>
              <Textarea name="call_notes" rows={4} defaultValue={selectedCall.call_notes ?? ""} />
            </div>
            <div>
              <Button size="sm">Save call</Button>
            </div>
          </form>
        ) : (
          <form action={addMentorshipCall.bind(null, program.id, enrollment.id)} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Scheduled</Label>
                <Input name="scheduled_at" type="datetime-local" defaultValue={nowInputDateTime()} required />
              </div>
              <div>
                <Label>Status</Label>
                <select name="status" defaultValue="scheduled" className="h-10 w-full rounded-md border border-ink-300 bg-ink-100 px-3 text-sm text-ink-900">
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <Input name="meeting_link" placeholder="Meeting link" />
            <div>
              <Label>Call notes (summary, observations, decisions, follow-ups)</Label>
              <Textarea name="call_notes" rows={4} />
            </div>
            <div>
              <Button size="sm">Create call</Button>
            </div>
          </form>
        )}

        <div className="mt-4 border-t border-ink-300 pt-4">
          <Label>Set mentor direction (student sees this on their dashboard)</Label>
          <form action={addMentorshipNote.bind(null, program.id, enrollment.id)} className="grid gap-2">
            <input type="hidden" name="is_direction" value="true" />
            <Textarea name="note" rows={2} placeholder='e.g. "Focus this week on fixing the product page before increasing ad spend."' required />
            <div>
              <Button size="sm">Set as active direction</Button>
            </div>
          </form>
        </div>

        <div className="mt-4 border-t border-ink-300 pt-4">
          <Label>Add an internal note (not shown to student, not direction)</Label>
          <form action={addMentorshipNote.bind(null, program.id, enrollment.id)} className="grid gap-2">
            <Textarea name="note" rows={2} placeholder="Internal observation for future reviews..." required />
            <div>
              <Button variant="outline" size="sm">
                Add note
              </Button>
            </div>
          </form>
        </div>
      </section>

      {/* 8. NEXT WEEK PLAN */}
      <section className="mt-6 border border-ink-300 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink-900">Next week plan</h2>
          <GenerateTasksButton programId={program.id} enrollmentId={enrollment.id} />
        </div>
        <p className="mb-3 text-sm text-ink-500">
          These open tasks feed the student&apos;s This Week&apos;s Focus automatically — mentor priority now genuinely affects that ranking.
        </p>

        {reviewData.execution.openTasks.length === 0 ? (
          <p className="text-sm text-ink-500">Nothing open. Generate this week&apos;s tasks, or add one below.</p>
        ) : (
          <div className="space-y-2">
            {reviewData.execution.openTasks.map((task) => (
              <MentorTaskRow
                key={task.id}
                programId={program.id}
                enrollmentId={enrollment.id}
                task={task}
                productName={task.product_catalog_id ? (catalogProducts.find((p) => p.id === task.product_catalog_id)?.name ?? null) : null}
                products={catalogProductOptions}
              />
            ))}
          </div>
        )}

        <div className="mt-4 border-t border-ink-300 pt-4">
          <p className="mb-2 font-mono text-xs uppercase text-ink-500">Add a task for next week</p>
          <MentorTaskForm programId={program.id} enrollmentId={enrollment.id} products={catalogProductOptions} />
        </div>
      </section>
    </div>
  );
}
