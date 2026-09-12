import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MentorshipAccessPanel } from "@/components/admin/mentorship-access-panel";
import { MentorDateFilter } from "@/components/admin/mentor/mentor-date-filter";
import { AccountHealthCard } from "@/components/admin/mentor/account-health-card";
import { BusinessSnapshot, moneyOrDash, percentOrDash, multOrDash } from "@/components/admin/mentor/business-snapshot";
import { MetaAdsMonitor } from "@/components/admin/mentor/meta-ads-monitor";
import { ProductPortfolio } from "@/components/admin/mentor/product-portfolio";
import { WhatChanged } from "@/components/admin/mentor/what-changed";
import { KpiSummaryCard } from "@/components/admin/mentor/kpi-summary-card";
import { PaymentsSummary } from "@/components/admin/mentor/payments-summary";
import { ConnectionsSummary } from "@/components/admin/mentor/connections-summary";
import { WhatsAppActions } from "@/components/admin/mentor/whatsapp-actions";
import { MentorWorkspaceClient } from "@/components/admin/mentor/mentor-workspace-client";
import { getMentorBriefing } from "@/lib/health/runner";
import { getMetaAdsOverview } from "@/lib/health/meta-ads-overview";
import { getWeeklyFocusTasks } from "@/lib/tasks/focus";
import { resolveDateRange, DEFAULT_DATE_RANGE_PRESET, type DateRangePreset } from "@/lib/products/date-range";
import { calculateRoas } from "@/lib/economics/calculate";
import { getEffectiveMentorshipStatus, getRemainingDays } from "@/lib/mentorship-access";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, RefreshCw } from "lucide-react";
import type {
  MentorshipCall,
  MentorshipConnection,
  MentorshipKpi,
  MentorshipPayment,
  MentorshipProfile,
  MentorshipTask,
} from "@/types/database";

interface Props {
  params: Promise<{ programId: string; enrollmentId: string }>;
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}

const VALID_PRESETS: DateRangePreset[] = ["today", "yesterday", "7d", "14d", "30d", "custom"];

const STATUS_TONE = {
  active: "success",
  paused: "warning",
  revoked: "warning",
  expired: "neutral",
} as const;

export default async function AdminMentorshipStudentWorkspace({ params, searchParams }: Props) {
  const { programId, enrollmentId } = await params;
  const { range: rangeParam, start, end } = await searchParams;
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

  const preset = VALID_PRESETS.includes(rangeParam as DateRangePreset) ? (rangeParam as DateRangePreset) : DEFAULT_DATE_RANGE_PRESET;
  const range = resolveDateRange(preset, preset === "custom" && start && end ? { start, end } : undefined);

  const [
    { data: studentProfile },
    { data: mentorProfile },
    { data: tasks },
    { data: kpis },
    { data: calls },
    { data: notes },
    { data: payments },
    { data: authUser },
    { data: connections },
    briefing,
    weeklyFocus,
    metaAds,
  ] = await Promise.all([
    supabase.from("profiles").select("id, full_name, avatar_url, created_at").eq("id", enrollment.user_id).single(),
    supabase.from("mentorship_profiles").select("*").eq("enrollment_id", enrollment.id).maybeSingle(),
    supabase.from("mentorship_tasks").select("*").eq("enrollment_id", enrollment.id).order("created_at", { ascending: false }),
    supabase
      .from("mentorship_kpis")
      .select("id, enrollment_id, metric_key, metric_label, value, recorded_for, created_at, updated_at")
      .eq("enrollment_id", enrollment.id)
      .order("recorded_for", { ascending: false }),
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
    supabase.from("mentorship_payments").select("*").eq("enrollment_id", enrollment.id).order("due_date", { ascending: true }),
    createAdminClient().auth.admin.getUserById(enrollment.user_id),
    supabase.from("mentorship_connections").select("*").eq("enrollment_id", enrollment.id).order("created_at", { ascending: false }),
    getMentorBriefing(supabase, enrollment.id, range),
    getWeeklyFocusTasks(supabase, enrollment.id),
    getMetaAdsOverview(supabase, enrollment.id, range),
  ]);

  const profile = studentProfile as { id: string; full_name: string | null; avatar_url: string | null; created_at: string } | null;
  const state = mentorProfile as MentorshipProfile | null;
  const orderedTasks = (tasks ?? []) as MentorshipTask[];
  const orderedKpis = (kpis ?? []) as MentorshipKpi[];
  const scheduledCalls = (calls ?? []) as MentorshipCall[];
  const mentorshipNotes = notes as
    | Array<{ id: string; note: string; is_mentor_direction: boolean; created_at: string; profiles?: { full_name: string | null } | null }>
    | null;
  const mentorshipPayments = (payments ?? []) as MentorshipPayment[];
  const studentEmail = authUser?.user?.email ?? "";
  const allConnections = (connections ?? []) as MentorshipConnection[];
  const connectionByProvider = new Map<string, MentorshipConnection>();
  for (const c of allConnections) {
    if (!connectionByProvider.has(c.provider)) connectionByProvider.set(c.provider, c);
  }

  const profileDisplayName = profile?.full_name ?? "Unnamed Student";
  const latestDirectionNote = mentorshipNotes?.find((n) => n.is_mentor_direction) ?? null;
  const nextPendingPayment = mentorshipPayments.find((p) => p.status !== "paid") ?? null;
  const upcomingCall = [...scheduledCalls]
    .filter((c) => new Date(c.scheduled_at) >= new Date())
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0] ?? null;
  const lastCompletedCall =
    [...scheduledCalls]
      .filter((c) => c.status.toLowerCase().includes("complet"))
      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())[0] ?? null;
  const openTasks = orderedTasks.filter((t) => t.status === "TODO" || t.status === "IN_PROGRESS");
  const completedOrSkippedTasks = orderedTasks.filter((t) => t.status === "DONE" || t.status === "SKIPPED");
  const catalogProducts = briefing.portfolio.map((p) => ({ id: p.product.id, name: p.product.name }));

  const effectiveStatus = state ? getEffectiveMentorshipStatus(state) : null;
  const remainingDays = state ? getRemainingDays(state) : null;

  const blendedRoas = calculateRoas({
    metaSpend: briefing.economics.totalAdSpend,
    metaPurchaseValue: null,
    shopifyRevenue: briefing.economics.totalRevenue,
  }).blendedRoas;
  const eligibleFulfillmentBase = briefing.economics.totalShipped + briefing.economics.totalDelivered + briefing.economics.totalNdr + briefing.economics.totalRto;
  const accountRtoRate = eligibleFulfillmentBase > 0 ? (briefing.economics.totalRto / eligibleFulfillmentBase) * 100 : null;

  const snapshotStats = [
    { label: "Revenue", value: moneyOrDash(briefing.economics.totalRevenue) },
    { label: "Ad Spend", value: moneyOrDash(briefing.economics.totalAdSpend) },
    { label: "Orders", value: String(briefing.economics.totalOrders) },
    { label: "Delivered", value: String(briefing.economics.totalDelivered) },
    { label: "RTO", value: percentOrDash(accountRtoRate) },
    { label: "Blended ROAS", value: multOrDash(blendedRoas) },
    { label: "Contribution", value: moneyOrDash(briefing.economics.totalContributionProfit) },
  ];

  const shopifyConnection = connectionByProvider.get("shopify");
  const metaConnection = connectionByProvider.get("meta");

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/mentorship/${program.id}`} className="inline-flex items-center text-sm text-ink-500 hover:text-ink-900">
          <ArrowLeft className="mr-1 h-3.5 w-3.5" />
          Back to roster
        </Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">{profileDisplayName}</h1>
              {effectiveStatus && <Badge tone={STATUS_TONE[effectiveStatus]}>{effectiveStatus}</Badge>}
            </div>
            <p className="break-words text-sm text-ink-500">
              {studentEmail}
              {remainingDays !== null && effectiveStatus === "active" ? ` · ${remainingDays} days remaining` : ""}
            </p>
            <p className="mt-0.5 font-mono text-xs text-ink-500">
              {program.title} · Joined {formatDate(enrollment.enrolled_at)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/mentorship/${program.id}/students/${enrollment.id}/review`}>
              <Button variant="outline" size="sm">
                Review Workspace
              </Button>
            </Link>
            <WhatsAppActions
              phone={state?.whatsapp_phone ?? null}
              studentName={profileDisplayName}
              topFocusTask={weeklyFocus[0] ?? null}
              latestDirection={latestDirectionNote}
              nextPendingPayment={nextPendingPayment}
              upcomingCall={upcomingCall}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <MentorDateFilter current={preset} customStart={start} customEnd={end} />
          <div className="flex flex-wrap items-center gap-3 text-xs text-ink-500">
            {shopifyConnection?.last_synced_at && (
              <span className="flex items-center gap-1">
                <RefreshCw className="h-3 w-3" /> Shopify synced {formatDate(shopifyConnection.last_synced_at)}
              </span>
            )}
            {metaConnection?.last_synced_at && (
              <span className="flex items-center gap-1">
                <RefreshCw className="h-3 w-3" /> Meta synced {formatDate(metaConnection.last_synced_at)}
              </span>
            )}
          </div>
        </div>
      </div>

      {state && <MentorshipAccessPanel programId={program.id} enrollmentId={enrollment.id} profile={state} />}

      <AccountHealthCard
        health={briefing.health}
        primaryBottleneck={briefing.bottlenecks[0] ?? null}
        secondaryCount={Math.max(0, briefing.bottlenecks.length - 1)}
      />

      <BusinessSnapshot stats={snapshotStats} />

      <MetaAdsMonitor
        ads={metaAds}
        lastSyncedLabel={metaConnection?.last_synced_at ? formatDate(metaConnection.last_synced_at) : null}
      />

      <ProductPortfolio
        entries={briefing.portfolio}
        enrollmentId={enrollment.id}
        rangePreset={preset}
        customStart={start}
        customEnd={end}
      />

      <WhatChanged changes={briefing.changes} reviewCutoffIso={briefing.reviewCutoffIso} />

      <MentorWorkspaceClient
        programId={program.id}
        enrollmentId={enrollment.id}
        weeklyFocusTasks={weeklyFocus}
        openTasks={openTasks}
        completedOrSkippedTasks={completedOrSkippedTasks}
        catalogProducts={catalogProducts}
        upcomingCall={upcomingCall}
        lastCompletedCall={lastCompletedCall}
        allCalls={scheduledCalls}
        latestDirection={latestDirectionNote}
        allNotes={mentorshipNotes}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <PaymentsSummary programId={program.id} enrollmentId={enrollment.id} payments={mentorshipPayments} />
        <ConnectionsSummary enrollmentId={enrollment.id} connectionByProvider={connectionByProvider} />
        <KpiSummaryCard programId={program.id} enrollmentId={enrollment.id} kpis={orderedKpis} />
      </div>

      <div>
        <Link href={`/admin/mentorship/${program.id}/students/${enrollment.id}/progress`} className="text-sm font-medium text-brand-300 hover:underline">
          View Progress →
        </Link>
      </div>
    </div>
  );
}
