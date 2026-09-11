import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, Textarea } from "@/components/ui/input";
import { MentorshipAccessPanel } from "@/components/admin/mentorship-access-panel";
import { MentorshipPaymentsPanel } from "@/components/admin/mentorship-payments-panel";
import { DisconnectButton } from "@/components/connections/disconnect-button";
import { MentorOverrideForm } from "@/components/products/mentor-override-form";
import { MentorTaskForm } from "@/components/admin/mentor-task-form";
import { MentorTaskRow } from "@/components/admin/mentor-task-row";
import { GenerateTasksButton } from "@/components/admin/generate-tasks-button";
import { Badge } from "@/components/ui/badge";
import { resolveEffectiveDecision } from "@/lib/decisions/effective";
import { getMentorBriefing } from "@/lib/health/runner";
import { getWeeklyFocusTasks } from "@/lib/tasks/focus";
import { resolveDateRange, DEFAULT_DATE_RANGE_PRESET } from "@/lib/products/date-range";
import { formatDate, formatPrice } from "@/lib/utils";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { WhatsAppCustomMessage } from "@/components/admin/whatsapp-custom-message";
import { MessageCircle } from "lucide-react";
import type { AccountHealthStatus } from "@/lib/health/types";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Lightbulb,
  NotebookPen,
  Package,
  Target,
  Users,
} from "lucide-react";
import {
  addMentorshipCall,
  addMentorshipKpi,
  addMentorshipNote,
  addMentorshipProduct,
  deleteMentorshipKpi,
  updateMentorshipCall,
  updateMentorshipKpi,
  updateMentorshipProduct,
  upsertMentorshipProfile,
} from "./actions";
import type {
  MentorshipCall,
  MentorshipConnection,
  MentorshipKpi,
  MentorshipPayment,
  MentorshipProduct,
  MentorshipProductCatalog,
  MentorshipProductDecision,
  MentorshipProductDecisionOverride,
  MentorshipProfile,
  MentorshipTask,
  ProgramResource,
} from "@/types/database";

interface Props {
  params: Promise<{
    programId: string;
    enrollmentId: string;
  }>;
}

function toIsoDate(date: string): string {
  return new Date(date).toISOString().slice(0, 10);
}

function toInputDateTime(date: string) {
  const parsed = new Date(date);
  return parsed.toISOString().slice(0, 16);
}

function currentWeekRange(): { monday: string; nextMonday: string } {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  return { monday: toIsoDate(monday.toISOString()), nextMonday: toIsoDate(nextMonday.toISOString()) };
}

const REQUIRED_KPI_KEYS = ["revenue", "ad_spend", "orders", "cpa", "roas", "rto", "profit"];

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

// Phase H tightens call status to a controlled select (scheduled/completed/
// cancelled) WITHOUT a DB CHECK constraint, so any pre-existing freeform
// value (e.g. old test data) must still render as a real, selectable
// option rather than silently jumping to "Scheduled" the moment a mentor
// edits anything else on that call.
const KNOWN_CALL_STATUSES = ["scheduled", "completed", "cancelled"];

export default async function AdminMentorshipStudentWorkspace({ params }: Props) {
  const { programId, enrollmentId } = await params;
  const supabase = await createClient();
  await requireAdmin();

  const { data: program } = await supabase
    .from("programs")
    .select("id, slug, title, status")
    .eq("id", programId)
    .eq("type_id", "mentorship")
    .maybeSingle();
  if (!program) notFound();

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, user_id, enrolled_at, order_id, program_id, profiles(full_name)")
    .eq("id", enrollmentId)
    .eq("program_id", program.id)
    .maybeSingle();
  if (!enrollment) notFound();

  const range = resolveDateRange(DEFAULT_DATE_RANGE_PRESET);

  const [
    { data: studentProfile },
    { data: order },
    { data: mentorProfile },
    { data: tasks },
    { data: kpis },
    { data: products },
    { data: calls },
    { data: notes },
    { data: resources },
    { data: payments },
    { data: authUser },
    { data: connections },
    briefing,
    weeklyFocus,
  ] = await Promise.all([
      supabase.from("profiles").select("id, full_name, avatar_url").eq("id", enrollment.user_id).single(),
      enrollment.order_id
        ? supabase.from("orders").select("id, status, amount, currency").eq("id", enrollment.order_id).single()
        : Promise.resolve({ data: null } as { data: { id: string; status: string; amount: number; currency: string } | null }),
      supabase.from("mentorship_profiles").select("*").eq("enrollment_id", enrollment.id).maybeSingle(),
      supabase
        .from("mentorship_tasks")
        .select("*")
        .eq("enrollment_id", enrollment.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("mentorship_kpis")
        .select("id, enrollment_id, metric_key, metric_label, value, recorded_for, created_at, updated_at")
        .eq("enrollment_id", enrollment.id)
        .order("recorded_for", { ascending: false }),
      supabase
        .from("mentorship_products")
        .select("id, enrollment_id, name, status, notes, created_at, updated_at")
        .eq("enrollment_id", enrollment.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("mentorship_calls")
        .select("id, enrollment_id, scheduled_at, status, meeting_link, recording_url, call_notes, created_at, updated_at")
        .eq("enrollment_id", enrollment.id)
        .order("scheduled_at", { ascending: false }),
      supabase
        .from("mentorship_notes")
        .select("id, enrollment_id, note, is_mentor_direction, created_at, profiles(id, full_name)")
        .eq("enrollment_id", enrollment.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("program_resources")
        .select("id, program_id, name, file_path, file_type, description, position, created_at, updated_at")
        .eq("program_id", program.id)
        .order("position", { ascending: true }),
      supabase
        .from("mentorship_payments")
        .select("*")
        .eq("enrollment_id", enrollment.id)
        .order("due_date", { ascending: true }),
      createAdminClient().auth.admin.getUserById(enrollment.user_id),
      supabase
        .from("mentorship_connections")
        .select("*")
        .eq("enrollment_id", enrollment.id)
        .order("created_at", { ascending: false }),
      getMentorBriefing(supabase, enrollment.id, range),
      getWeeklyFocusTasks(supabase, enrollment.id),
    ]);

  const { data: catalogProductRows } = await supabase
    .from("mentorship_product_catalog")
    .select("*")
    .eq("enrollment_id", enrollment.id)
    .order("created_at", { ascending: false });
  const catalogProducts = (catalogProductRows ?? []) as MentorshipProductCatalog[];

  const [{ data: allProductDecisionRows }, { data: allOverrideRows }] = await Promise.all([
    supabase.from("mentorship_product_decisions").select("*").eq("enrollment_id", enrollment.id).order("created_at", { ascending: false }),
    supabase.from("mentorship_product_decision_overrides").select("*").eq("enrollment_id", enrollment.id).order("created_at", { ascending: false }),
  ]);
  const latestDecisionByProduct = new Map<string, MentorshipProductDecision>();
  for (const d of (allProductDecisionRows ?? []) as MentorshipProductDecision[]) {
    if (!latestDecisionByProduct.has(d.product_catalog_id)) latestDecisionByProduct.set(d.product_catalog_id, d);
  }
  const latestOverrideByProduct = new Map<string, MentorshipProductDecisionOverride>();
  for (const o of (allOverrideRows ?? []) as MentorshipProductDecisionOverride[]) {
    if (!latestOverrideByProduct.has(o.product_catalog_id)) latestOverrideByProduct.set(o.product_catalog_id, o);
  }

  const profile = studentProfile as { id: string; full_name: string | null; avatar_url: string | null } | null;
  const state = mentorProfile as MentorshipProfile | null;
  const orderedTasks = (tasks ?? []) as MentorshipTask[];
  const orderedKpis = (kpis ?? []) as MentorshipKpi[];
  const allProducts = (products ?? []) as MentorshipProduct[];
  const scheduledCalls = (calls ?? []) as MentorshipCall[];
  const mentorshipNotes = notes as
    | Array<{ id: string; note: string; is_mentor_direction: boolean; created_at: string; profiles?: { full_name: string | null } | null }>
    | null;
  const programResources = (resources ?? []) as ProgramResource[];
  const orderRow = order as { id: string; status: string; amount: number; currency: string } | null;
  const mentorshipPayments = (payments ?? []) as MentorshipPayment[];
  const studentEmail = authUser?.user?.email ?? "";
  const allConnections = (connections ?? []) as MentorshipConnection[];
  const latestConnectionByProvider = new Map<string, MentorshipConnection>();
  for (const c of allConnections) {
    if (!latestConnectionByProvider.has(c.provider)) latestConnectionByProvider.set(c.provider, c);
  }

  const profileDisplayName = profile?.full_name ?? "Unnamed Student";
  const latestDirectionNote = mentorshipNotes?.find((n) => n.is_mentor_direction) ?? null;
  const nextPendingPayment = mentorshipPayments.find((p) => p.status !== "paid") ?? null;
  const upcomingCall = [...scheduledCalls]
    .filter((c) => new Date(c.scheduled_at) >= new Date())
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0] ?? null;
  const topFocusTask = weeklyFocus[0] ?? null;
  const { monday, nextMonday } = currentWeekRange();
  const currentTasks = orderedTasks.filter((task) => task.week_start >= monday && task.week_start < nextMonday);
  const openTasks = orderedTasks.filter((t) => t.status === "TODO" || t.status === "IN_PROGRESS");
  const completedOrSkippedTasks = orderedTasks.filter((t) => t.status === "DONE" || t.status === "SKIPPED");
  const catalogProductNameById = new Map(catalogProducts.map((p) => [p.id, p.name]));

  const latestKpis = new Map<string, MentorshipKpi>();
  for (const kpi of orderedKpis) {
    if (!latestKpis.has(kpi.metric_key)) latestKpis.set(kpi.metric_key, kpi);
  }

  return (
    <div>
      <Link href={`/admin/mentorship/${program.id}`} className="mb-5 inline-flex items-center text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="mr-1 h-3.5 w-3.5" />
        Back to roster
      </Link>

      <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Mentorship workspace</p>
      <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink-900">{program.title}</h1>
      <p className="mt-1 text-sm text-ink-500">
        Student: {profileDisplayName}
        {studentEmail ? ` · ${studentEmail}` : ""}
      </p>

      {state && (
        <div className="mt-6">
          <MentorshipAccessPanel programId={program.id} enrollmentId={enrollment.id} profile={state} />
        </div>
      )}

      {/* WHATSAPP — manual only. This app never sends anything itself; every
          link below just opens WhatsApp with a prefilled draft the admin
          reviews and sends themselves. */}
      {state && (
        <div className="mt-6 border border-ink-300 p-5">
          <div className="mb-3 flex items-center">
            <MessageCircle className="mr-2 h-4 w-4 text-ink-500" />
            <h2 className="font-display text-lg font-semibold text-ink-900">WhatsApp</h2>
          </div>
          {state.whatsapp_phone && buildWhatsAppUrl(state.whatsapp_phone) ? (
            <div className="space-y-4">
              <a href={buildWhatsAppUrl(state.whatsapp_phone) ?? "#"} target="_blank" rel="noopener noreferrer">
                <Button size="sm">
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp Student
                </Button>
              </a>

              <div className="flex flex-wrap gap-2">
                {topFocusTask && (
                  <a
                    href={
                      buildWhatsAppUrl(
                        state.whatsapp_phone,
                        `Hey ${profileDisplayName}, quick reminder — your priority this week is ${topFocusTask.title}. Please get this done before our next call.`
                      ) ?? "#"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button type="button" variant="outline" size="sm">
                      Task reminder
                    </Button>
                  </a>
                )}
                {latestDirectionNote && (
                  <a
                    href={
                      buildWhatsAppUrl(
                        state.whatsapp_phone,
                        `Hey ${profileDisplayName}, I've reviewed your account. Your main focus this week is: ${latestDirectionNote.note}`
                      ) ?? "#"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button type="button" variant="outline" size="sm">
                      Mentor direction
                    </Button>
                  </a>
                )}
                {nextPendingPayment && (
                  <a
                    href={
                      buildWhatsAppUrl(
                        state.whatsapp_phone,
                        `Hey ${profileDisplayName}, your mentorship payment of ${formatPrice(nextPendingPayment.amount, nextPendingPayment.currency)} is pending.${
                          nextPendingPayment.razorpay_link ? ` Payment link: ${nextPendingPayment.razorpay_link}` : ""
                        }`
                      ) ?? "#"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button type="button" variant="outline" size="sm">
                      Payment reminder
                    </Button>
                  </a>
                )}
                {upcomingCall && (
                  <a
                    href={
                      buildWhatsAppUrl(
                        state.whatsapp_phone,
                        `Hey ${profileDisplayName}, reminder that we're scheduled for our mentorship call on ${formatDate(upcomingCall.scheduled_at)}, ${new Date(
                          upcomingCall.scheduled_at
                        ).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.`
                      ) ?? "#"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button type="button" variant="outline" size="sm">
                      Call reminder
                    </Button>
                  </a>
                )}
              </div>

              <div className="border-t border-ink-300 pt-3">
                <p className="mb-2 font-mono text-[11px] uppercase text-ink-500">Custom message</p>
                <WhatsAppCustomMessage phone={state.whatsapp_phone} studentName={profileDisplayName} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-500">No WhatsApp number on file yet — add one under Current state below.</p>
          )}
        </div>
      )}

      <div className="mt-6">
        <MentorshipPaymentsPanel programId={program.id} enrollmentId={enrollment.id} payments={mentorshipPayments} />
      </div>

      {/* ACCOUNT HEALTH / 2-MINUTE CALL-PREP BRIEFING — Phase G */}
      <div className="mt-6 border-2 border-ink-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-ink-900">Account health &amp; call prep</h2>
          <div className="flex items-center gap-2">
            <Badge tone={HEALTH_TONE[briefing.health.status]}>{HEALTH_LABEL[briefing.health.status]}</Badge>
            <Link href={`/admin/mentorship/${program.id}/students/${enrollment.id}/review`}>
              <Button size="sm">Start Review</Button>
            </Link>
          </div>
        </div>

        <div className="mt-3">
          <p className="font-mono text-[11px] uppercase text-ink-500">Primary business focus</p>
          {briefing.bottlenecks.length === 0 ? (
            <p className="mt-1 text-sm text-ink-500">No urgent business issue right now.</p>
          ) : (
            <div className="mt-1">
              <p className="font-medium text-ink-900">
                {briefing.bottlenecks[0]!.productName ? `${briefing.bottlenecks[0]!.productName}: ` : ""}
                {briefing.bottlenecks[0]!.what}
              </p>
              <p className="mt-1 text-sm text-ink-700">{briefing.bottlenecks[0]!.why}</p>
              <p className="mt-1 text-sm text-ink-800">→ {briefing.bottlenecks[0]!.nextAction}</p>
            </div>
          )}
          {briefing.health.status !== "HEALTHY" && briefing.health.reasons.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-ink-500">
              {briefing.health.reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          )}
        </div>

        {briefing.insights.length > 0 && (
          <div className="mt-3 border-t border-ink-300 pt-3">
            <p className="font-mono text-[11px] uppercase text-ink-500">Portfolio</p>
            <ul className="mt-1 space-y-1 text-sm text-ink-700">
              {briefing.insights.map((insight, i) => (
                <li key={i}>• {insight.text}</li>
              ))}
            </ul>
          </div>
        )}

        {briefing.bottlenecks.length > 1 && (
          <div className="mt-3 border-t border-ink-300 pt-3">
            <p className="font-mono text-[11px] uppercase text-ink-500">Also needs attention</p>
            <ul className="mt-1 space-y-1 text-sm text-ink-700">
              {briefing.bottlenecks.slice(1, 4).map((b, i) => (
                <li key={i}>{b.productName ? `${b.productName}: ` : ""}{b.what}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-ink-300 pt-3 sm:grid-cols-4">
          <div>
            <p className="font-mono text-[11px] uppercase text-ink-500">Open tasks</p>
            <p className="mt-1 font-semibold text-ink-900">{briefing.openTaskCount}</p>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase text-ink-500">Overdue</p>
            <p className="mt-1 font-semibold text-ink-900">{briefing.overdueTaskCount}</p>
          </div>
        </div>

        <div className="mt-3 border-t border-ink-300 pt-3">
          <p className="font-mono text-[11px] uppercase text-ink-500">Latest mentor override</p>
          {briefing.latestOverride ? (
            <p className="mt-1 text-sm text-ink-700">
              {briefing.latestOverride.productName}: {briefing.latestOverride.decision.replace("_", " ")} — &quot;{briefing.latestOverride.reason}&quot; (
              {formatDate(briefing.latestOverride.createdAt)})
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-500">No overrides yet.</p>
          )}
        </div>

        <div className="mt-3 border-t border-ink-300 pt-3">
          <p className="font-mono text-[11px] uppercase text-ink-500">Since last review ({formatDate(briefing.reviewCutoffIso)})</p>
          {briefing.changes.length === 0 ? (
            <p className="mt-1 text-sm text-ink-500">No notable changes since the last review.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm text-ink-700">
              {briefing.changes.map((change, i) => (
                <li key={i}>• {change.detail}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Connections</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {(["shopify", "meta"] as const).map((provider) => {
            const connection = latestConnectionByProvider.get(provider);
            const label = provider === "shopify" ? "Shopify" : "Meta Ads";
            const isConnected = connection?.status === "connected";
            return (
              <div key={provider} className="border border-ink-300 p-3">
                <p className="font-medium text-ink-900">{label}</p>
                <p className="mt-1 font-mono text-xs text-ink-500">
                  {isConnected
                    ? `Connected · ${connection?.external_account_name ?? connection?.external_account_id}`
                    : connection?.status === "pending_selection"
                      ? "Pending account selection"
                      : "Not connected"}
                </p>
                {isConnected && connection && (
                  <div className="mt-2">
                    <DisconnectButton enrollmentId={enrollment.id} connectionId={connection.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Product Decisions</h2>
        <p className="mt-1 text-sm text-ink-500">
          System decisions from the deterministic engine, and mentor overrides. Overriding never edits the engine&apos;s own record.
        </p>
        {catalogProducts.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">This student has no products yet.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {catalogProducts.map((product) => {
              const decision = latestDecisionByProduct.get(product.id) ?? null;
              const override = latestOverrideByProduct.get(product.id) ?? null;
              const effective = resolveEffectiveDecision(decision, override);
              return (
                <div key={product.id} className="border border-ink-300 p-3">
                  <p className="font-medium text-ink-900">{product.name}</p>
                  {decision ? (
                    <>
                      <p className="mt-1 font-mono text-xs text-ink-500">
                        System decision: {decision.decision.replace("_", " ")} · {formatDate(decision.created_at)}
                      </p>
                      {effective.isOverridden && effective.activeOverride && (
                        <p className="mt-1 font-mono text-xs text-brand-300">
                          Mentor override: {effective.activeOverride.override_decision.replace("_", " ")} — &quot;{effective.activeOverride.override_reason}&quot;
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-ink-500">No decision evaluated yet.</p>
                  )}
                  <MentorOverrideForm enrollmentId={enrollment.id} productCatalogId={product.id} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="border border-ink-300 p-4">
          <p className="font-mono text-[11px] uppercase text-ink-500">Student</p>
          <p className="mt-1 font-semibold">{profileDisplayName}</p>
        </div>
        <div className="border border-ink-300 p-4">
          <p className="font-mono text-[11px] uppercase text-ink-500">Enrolled</p>
          <p className="mt-1 font-semibold">{formatDate(enrollment.enrolled_at)}</p>
        </div>
        <div className="border border-ink-300 p-4">
          <p className="font-mono text-[11px] uppercase text-ink-500">Program</p>
          <p className="mt-1 font-semibold">/{program.slug}</p>
        </div>
        <div className="border border-ink-300 p-4">
          <p className="font-mono text-[11px] uppercase text-ink-500">Payment</p>
          <p className="mt-1 font-semibold">{orderRow ? `${orderRow.status.toUpperCase()}` : "Enrollment only"}</p>
        </div>
      </div>

      <div className="mt-8 border border-ink-300 p-5">
        <div className="mb-3 flex items-center">
          <Target className="mr-2 h-4 w-4 text-ink-500" />
          <h2 className="font-display text-lg font-semibold text-ink-900">Current state</h2>
        </div>

        <form action={upsertMentorshipProfile.bind(null, programId, enrollment.id)} className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="current_stage">Current stage</Label>
            <Input id="current_stage" name="current_stage" defaultValue={state?.current_stage ?? ""} />
          </div>
          <div>
            <Label htmlFor="current_objective">Current objective</Label>
            <Textarea
              id="current_objective"
              name="current_objective"
              rows={3}
              defaultValue={state?.current_objective ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="whatsapp_phone">WhatsApp number</Label>
            <Input
              id="whatsapp_phone"
              name="whatsapp_phone"
              placeholder="+91 98765 43210"
              defaultValue={state?.whatsapp_phone ?? ""}
            />
            <p className="mt-1 text-xs text-ink-500">Used only for the manual WhatsApp shortcuts above — never sent to any third party.</p>
          </div>
          <div className="sm:col-span-2">
            <Button>
              <CheckCircle2 className="h-4 w-4" />
              Save state
            </Button>
          </div>
        </form>
      </div>

      <div className="mt-6 grid gap-6">
        <section className="border border-ink-300 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center">
              <CalendarClock className="mr-2 h-4 w-4 text-ink-500" />
              <h2 className="font-display text-lg font-semibold text-ink-900">Weekly tasks</h2>
            </div>
            <GenerateTasksButton programId={program.id} enrollmentId={enrollment.id} />
          </div>
          <p className="mb-3 text-sm text-ink-500">
            Decision-engine-generated, data-quality, and mentor-created tasks. Skipping/completing here never edits the underlying
            decision record.
          </p>

          <div className="space-y-4">
            <div>
              <p className="mb-2 font-mono text-xs uppercase text-ink-500">Open ({openTasks.length})</p>
              {openTasks.length === 0 ? (
                <p className="text-sm text-ink-500">Nothing open.</p>
              ) : (
                <div className="space-y-2">
                  {openTasks.map((task) => (
                    <MentorTaskRow
                      key={task.id}
                      programId={program.id}
                      enrollmentId={enrollment.id}
                      task={task}
                      productName={task.product_catalog_id ? (catalogProductNameById.get(task.product_catalog_id) ?? null) : null}
                      products={catalogProducts.map((p) => ({ id: p.id, name: p.name }))}
                    />
                  ))}
                </div>
              )}
            </div>

            {completedOrSkippedTasks.length > 0 && (
              <div>
                <p className="mb-2 font-mono text-xs uppercase text-ink-500">Completed / skipped ({completedOrSkippedTasks.length})</p>
                <div className="space-y-2">
                  {completedOrSkippedTasks.slice(0, 10).map((task) => (
                    <MentorTaskRow
                      key={task.id}
                      programId={program.id}
                      enrollmentId={enrollment.id}
                      task={task}
                      productName={task.product_catalog_id ? (catalogProductNameById.get(task.product_catalog_id) ?? null) : null}
                      products={catalogProducts.map((p) => ({ id: p.id, name: p.name }))}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 border-t border-ink-300 pt-4">
            <p className="mb-2 font-mono text-xs uppercase text-ink-500">Add a mentor task</p>
            <MentorTaskForm programId={program.id} enrollmentId={enrollment.id} products={catalogProducts.map((p) => ({ id: p.id, name: p.name }))} />
          </div>
        </section>

        <section className="border border-ink-300 p-5">
          <div className="mb-3 flex items-center">
            <Lightbulb className="mr-2 h-4 w-4 text-ink-500" />
            <h2 className="font-display text-lg font-semibold text-ink-900">KPIs</h2>
          </div>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {REQUIRED_KPI_KEYS.map((key) => {
              const label = (latestKpis.get(key)?.metric_label ?? key).toUpperCase();
              const metric = latestKpis.get(key);
              return (
                <div key={key} className="rounded-md border border-ink-300 p-3">
                  <p className="font-mono text-[11px] uppercase text-ink-500">{label}</p>
                  <p className="mt-1 text-lg font-semibold text-ink-900">
                    {metric ? metric.value : "—"}
                  </p>
                </div>
              );
            })}
          </div>

          <form action={addMentorshipKpi.bind(null, program.id, enrollment.id)} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_140px_140px]">
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

          <div className="mt-4">
            {orderedKpis.length === 0 ? (
              <p className="text-sm text-ink-500">No KPI history yet.</p>
            ) : (
              <div className="divide-y divide-ink-300 border-t border-ink-300">
                {orderedKpis.map((kpi) => (
                  <div key={kpi.id} className="grid gap-3 py-3 sm:grid-cols-[1fr_1fr_110px_110px_auto] sm:items-end">
                    <form action={updateMentorshipKpi.bind(null, program.id, enrollment.id)}>
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
                      <div className="flex items-center gap-2 sm:col-span-1 sm:justify-end sm:py-0">
                        <Button variant="outline" size="sm">Save</Button>
                      </div>
                    </form>

                    <div className="flex items-end">
                      <form action={deleteMentorshipKpi.bind(null, program.id, enrollment.id, kpi.id)}>
                        <Button variant="danger" size="sm">Delete</Button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="border border-ink-300 p-5">
          <div className="mb-3 flex items-center">
            <Package className="mr-2 h-4 w-4 text-ink-500" />
            <h2 className="font-display text-lg font-semibold text-ink-900">Products</h2>
          </div>
          <form action={addMentorshipProduct.bind(null, program.id, enrollment.id)} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_130px]">
              <div>
                <Label htmlFor="name">Product</Label>
                <Input id="name" name="name" required />
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  name="status"
                  className="h-10 w-full rounded-md border border-ink-300 bg-ink-100 px-3 text-sm text-ink-900"
                >
                  <option value="testing">Testing</option>
                  <option value="keep">Keep</option>
                  <option value="kill">Kill</option>
                  <option value="scale">Scale</option>
                </select>
              </div>
            </div>
            <Textarea name="notes" rows={3} placeholder="Notes" />
            <Button size="sm">Add product</Button>
          </form>

          <div className="mt-4 space-y-3">
            {allProducts.length === 0 ? (
              <p className="text-sm text-ink-500">No products yet.</p>
            ) : (
              allProducts.map((product) => (
                <form
                  key={product.id}
                  action={updateMentorshipProduct.bind(null, program.id, enrollment.id)}
                  className="grid gap-3 border-t border-ink-300 pt-3"
                >
                  <input type="hidden" name="product_id" value={product.id} />
                  <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                    <div>
                      <Label>Name</Label>
                      <Input name="name" defaultValue={product.name} required />
                    </div>
                    <div>
                      <Label>Status</Label>
                      <select name="status" defaultValue={product.status} className="h-10 w-full rounded-md border border-ink-300 bg-ink-100 px-3 text-sm">
                        <option value="testing">Testing</option>
                        <option value="keep">Keep</option>
                        <option value="kill">Kill</option>
                        <option value="scale">Scale</option>
                      </select>
                    </div>
                  </div>
                  <Textarea name="notes" rows={2} defaultValue={product.notes ?? ""} />
                  <div>
                    <Button variant="outline" size="sm">
                      Save product
                    </Button>
                  </div>
                </form>
              ))
            )}
          </div>
        </section>

        <section className="border border-ink-300 p-5">
          <div className="mb-3 flex items-center">
            <CalendarClock className="mr-2 h-4 w-4 text-ink-500" />
            <h2 className="font-display text-lg font-semibold text-ink-900">Calls</h2>
          </div>
          <form action={addMentorshipCall.bind(null, program.id, enrollment.id)} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_130px]">
              <div>
                <Label htmlFor="scheduled_at">Scheduled at</Label>
                <Input
                  id="scheduled_at"
                  name="scheduled_at"
                  type="datetime-local"
                  required
                  defaultValue={toInputDateTime(new Date().toISOString())}
                />
              </div>
              <div>
                <Label htmlFor="call_status">Status</Label>
                <select
                  id="call_status"
                  name="status"
                  defaultValue="scheduled"
                  className="h-10 w-full rounded-md border border-ink-300 bg-ink-100 px-3 text-sm text-ink-900"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <Input name="meeting_link" placeholder="Meeting link" />
            <Textarea name="call_notes" rows={2} placeholder="Call notes" />
            <Button size="sm">Schedule call</Button>
          </form>

          <div className="mt-4 space-y-3">
            {scheduledCalls.length === 0 ? (
              <p className="text-sm text-ink-500">No calls yet.</p>
            ) : (
              scheduledCalls.map((call) => (
                <form
                  key={call.id}
                  action={updateMentorshipCall.bind(null, program.id, enrollment.id)}
                  className="grid gap-3 border-t border-ink-300 pt-3"
                >
                  <input type="hidden" name="call_id" value={call.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Scheduled</Label>
                      <Input name="scheduled_at" type="datetime-local" defaultValue={toInputDateTime(call.scheduled_at)} required />
                    </div>
                    <div>
                      <Label>Status</Label>
                      <select
                        name="status"
                        defaultValue={call.status}
                        className="h-10 w-full rounded-md border border-ink-300 bg-ink-100 px-3 text-sm text-ink-900"
                      >
                        {!KNOWN_CALL_STATUSES.includes(call.status) && <option value={call.status}>{call.status} (legacy)</option>}
                        <option value="scheduled">Scheduled</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                  </div>
                  <Input name="meeting_link" placeholder="Meeting link" defaultValue={call.meeting_link ?? ""} />
                  <Input name="recording_url" placeholder="Recording URL" defaultValue={call.recording_url ?? ""} />
                  <Textarea name="call_notes" rows={2} defaultValue={call.call_notes ?? ""} />
                  <Button variant="outline" size="sm">
                    Save call
                  </Button>
                </form>
              ))
            )}
          </div>
        </section>

        <section className="border border-ink-300 p-5">
          <div className="mb-3 flex items-center">
            <NotebookPen className="mr-2 h-4 w-4 text-ink-500" />
            <h2 className="font-display text-lg font-semibold text-ink-900">Mentor notes</h2>
          </div>

          <form action={addMentorshipNote.bind(null, program.id, enrollment.id)} className="space-y-3">
            <Textarea name="note" rows={3} placeholder="Add a new note..." required />
            <Button size="sm">Add note</Button>
          </form>

          <div className="mt-4">
            {mentorshipNotes && mentorshipNotes.length > 0 ? (
              <div className="space-y-3">
                {mentorshipNotes.map((note) => (
                  <div key={note.id} className="rounded-md border border-ink-300 p-3">
                    {note.is_mentor_direction && (
                      <Badge tone="brand" className="mb-1">
                        DIRECTION
                      </Badge>
                    )}
                    <p className="text-sm text-ink-800">{note.note}</p>
                    <p className="mt-1 font-mono text-xs text-ink-500">
                      {(note.profiles as { full_name: string | null } | undefined)?.full_name ?? "Unknown"} · {formatDate(note.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Users} title="No mentor notes yet" />
            )}
          </div>
        </section>

        <section className="border border-ink-300 p-5">
          <h2 className="font-display text-lg font-semibold text-ink-900">Resources</h2>
          <div className="mt-3 space-y-3">
            {programResources.length === 0 ? (
              <p className="text-sm text-ink-500">No resources attached to this mentorship program.</p>
            ) : (
              programResources.map((resource) => (
                <div key={resource.id} className="flex items-start justify-between border-b border-ink-300 pb-3">
                  <div>
                    <p className="font-medium text-ink-900">{resource.name}</p>
                    <p className="font-mono text-xs text-ink-500">{resource.file_type ?? "resource"}</p>
                  </div>
                  <p className="font-mono text-xs text-ink-500">/{resource.file_path}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
