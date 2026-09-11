"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { addDaysToIsoDate, computePausedDays, todayIstIsoDate } from "@/lib/mentorship-access";
import { generateWeeklyTasks } from "@/lib/tasks/generate-runner";
import type { MentorshipTaskPriority, MentorshipTaskStatus } from "@/types/database";

type ProductStatus = "testing" | "keep" | "kill" | "scale";
type PaymentStatus = "pending" | "paid" | "overdue";
type CallStatus = "scheduled" | "completed" | "cancelled";
const ALLOWED_CALL_STATUSES: CallStatus[] = ["scheduled", "completed", "cancelled"];

function revalidateMentorshipWorkspace(programId: string, enrollmentId: string) {
  revalidatePath(`/admin/mentorship/${programId}`);
  revalidatePath(`/admin/mentorship/${programId}/students/${enrollmentId}`);
}

// Admin edits a task's mentor-only fields (title, description, priority,
// due date, product assignment, mentor notes) through the service-role
// client. This isn't optional convenience — migration 0011's column-level
// GRANT means the shared `authenticated` Postgres role (which both student
// AND admin sessions use) can only ever UPDATE status/is_done/completed_at
// through RLS, regardless of is_admin(). Elevated writes go server-only,
// the same pattern already used for OAuth tokens (Phase A) and decision
// records (Phase E).
async function revalidateStudentDashboardToo(programId: string, enrollmentId: string) {
  const supabase = await createClient();
  const { data: enrollment } = await supabase.from("enrollments").select("programs(slug)").eq("id", enrollmentId).maybeSingle();
  const slugValue = enrollment?.programs as unknown as { slug: string } | { slug: string }[] | null;
  const slug = Array.isArray(slugValue) ? slugValue[0]?.slug : slugValue?.slug;
  if (slug) revalidatePath(`/dashboard/mentorship/${slug}`);
  revalidateMentorshipWorkspace(programId, enrollmentId);
}

function parseText(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);
  return value ? String(value).trim() : fallback;
}

function parseNumber(formData: FormData, key: string, fallback = 0) {
  const value = formData.get(key);
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function upsertMentorshipProfile(programId: string, enrollmentId: string, formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const currentStage = parseText(formData, "current_stage", "discovery");
  const currentObjective = parseText(formData, "current_objective");
  const whatsappPhone = parseText(formData, "whatsapp_phone");

  const { error } = await supabase
    .from("mentorship_profiles")
    .upsert(
      {
        enrollment_id: enrollmentId,
        current_stage: currentStage,
        current_objective: currentObjective || null,
        whatsapp_phone: whatsappPhone || null,
      },
      { onConflict: "enrollment_id" }
    );

  if (error) throw new Error("Could not update mentorship profile.");
  revalidateMentorshipWorkspace(programId, enrollmentId);
}

export async function addMentorshipTask(programId: string, enrollmentId: string, formData: FormData) {
  await requireAdmin();
  const title = parseText(formData, "title");
  if (!title) throw new Error("Task title is required.");

  const weekStart = parseText(formData, "week_start");
  if (!weekStart) throw new Error("Week start date is required.");

  const position = Math.max(0, Math.floor(parseNumber(formData, "position", 0)));

  const supabase = await createClient();
  const { error } = await supabase.from("mentorship_tasks").insert({
    enrollment_id: enrollmentId,
    week_start: weekStart,
    title,
    position,
  });
  if (error) throw new Error("Could not add task.");
  revalidateMentorshipWorkspace(programId, enrollmentId);
}

export async function setMentorshipTaskDone(programId: string, enrollmentId: string, taskId: string, done: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("mentorship_tasks")
    .update({ is_done: done })
    .eq("id", taskId)
    .eq("enrollment_id", enrollmentId);
  if (error) throw new Error("Could not update task status.");
  revalidateMentorshipWorkspace(programId, enrollmentId);
}

export async function deleteMentorshipTask(programId: string, enrollmentId: string, taskId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("mentorship_tasks").delete().eq("id", taskId).eq("enrollment_id", enrollmentId);
  if (error) throw new Error("Could not delete task.");
  revalidateMentorshipWorkspace(programId, enrollmentId);
}

// ----------------------------------------------------------------------------
// Phase F — full mentor task management (create/edit/prioritize/skip/
// complete/assign-to-product). None of this ever writes to
// mentorship_product_decisions or mentorship_product_decision_overrides —
// task management and the decision engine remain entirely separate
// systems, exactly as required.
// ----------------------------------------------------------------------------

export interface MentorTaskInput {
  title: string;
  description: string | null;
  why: string | null;
  nextAction: string | null;
  priority: MentorshipTaskPriority;
  dueDate: string | null;
  productCatalogId: string | null;
  mentorNotes: string | null;
}

function todayMondayIso(): string {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

export async function createMentorTask(programId: string, enrollmentId: string, input: MentorTaskInput) {
  await requireAdmin();
  if (!input.title.trim()) throw new Error("Task title is required.");

  const admin = createAdminClient();
  const { error } = await admin.from("mentorship_tasks").insert({
    enrollment_id: enrollmentId,
    week_start: todayMondayIso(),
    title: input.title.trim(),
    description: input.description,
    why: input.why,
    next_action: input.nextAction,
    priority: input.priority,
    due_date: input.dueDate,
    product_catalog_id: input.productCatalogId,
    mentor_notes: input.mentorNotes,
    source: "MENTOR",
    status: "TODO",
    is_done: false,
  });
  if (error) throw new Error("Could not create task.");
  await revalidateStudentDashboardToo(programId, enrollmentId);
}

export async function updateMentorTask(programId: string, enrollmentId: string, taskId: string, input: MentorTaskInput) {
  await requireAdmin();
  if (!input.title.trim()) throw new Error("Task title is required.");

  const admin = createAdminClient();
  const { error } = await admin
    .from("mentorship_tasks")
    .update({
      title: input.title.trim(),
      description: input.description,
      why: input.why,
      next_action: input.nextAction,
      priority: input.priority,
      due_date: input.dueDate,
      product_catalog_id: input.productCatalogId,
      mentor_notes: input.mentorNotes,
    })
    .eq("id", taskId)
    .eq("enrollment_id", enrollmentId);
  if (error) throw new Error("Could not update task.");
  await revalidateStudentDashboardToo(programId, enrollmentId);
}

export async function setMentorTaskStatus(programId: string, enrollmentId: string, taskId: string, status: MentorshipTaskStatus) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("mentorship_tasks")
    .update({
      status,
      is_done: status === "DONE",
      completed_at: status === "DONE" ? new Date().toISOString() : null,
    })
    .eq("id", taskId)
    .eq("enrollment_id", enrollmentId);
  if (error) throw new Error("Could not update task status.");
  await revalidateStudentDashboardToo(programId, enrollmentId);
}

// Admin-triggered weekly generation — identical engine, identical
// idempotency guarantee as the student-triggered version.
export async function runWeeklyTaskGenerationAdmin(programId: string, enrollmentId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const result = await generateWeeklyTasks(supabase, enrollmentId);
  await revalidateStudentDashboardToo(programId, enrollmentId);
  return result;
}

export async function addMentorshipKpi(programId: string, enrollmentId: string, formData: FormData) {
  await requireAdmin();
  const metricKey = parseText(formData, "metric_key");
  const metricLabel = parseText(formData, "metric_label", metricKey);
  if (!metricKey) throw new Error("Metric key is required.");
  const value = parseNumber(formData, "value");
  const recordedFor = parseText(formData, "recorded_for");
  if (!recordedFor) throw new Error("Recorded date is required.");

  const supabase = await createClient();
  const { error } = await supabase.from("mentorship_kpis").insert({
    enrollment_id: enrollmentId,
    metric_key: metricKey,
    metric_label: metricLabel,
    value,
    recorded_for: recordedFor,
  });
  if (error) throw new Error("Could not add KPI.");
  revalidateMentorshipWorkspace(programId, enrollmentId);
}

export async function updateMentorshipKpi(programId: string, enrollmentId: string, formData: FormData) {
  await requireAdmin();
  const kpiId = parseText(formData, "kpi_id");
  if (!kpiId) throw new Error("KPI is required.");

  const metricKey = parseText(formData, "metric_key");
  const metricLabel = parseText(formData, "metric_label", metricKey);
  if (!metricKey) throw new Error("Metric key is required.");
  const value = parseNumber(formData, "value");
  const recordedFor = parseText(formData, "recorded_for");
  if (!recordedFor) throw new Error("Recorded date is required.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("mentorship_kpis")
    .update({
      metric_key: metricKey,
      metric_label: metricLabel,
      value,
      recorded_for: recordedFor,
    })
    .eq("id", kpiId)
    .eq("enrollment_id", enrollmentId);
  if (error) throw new Error("Could not update KPI.");
  revalidateMentorshipWorkspace(programId, enrollmentId);
}

export async function deleteMentorshipKpi(programId: string, enrollmentId: string, kpiId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("mentorship_kpis").delete().eq("id", kpiId).eq("enrollment_id", enrollmentId);
  if (error) throw new Error("Could not delete KPI.");
  revalidateMentorshipWorkspace(programId, enrollmentId);
}

export async function addMentorshipProduct(programId: string, enrollmentId: string, formData: FormData) {
  await requireAdmin();
  const name = parseText(formData, "name");
  if (!name) throw new Error("Product name is required.");
  const status = parseText(formData, "status", "testing") as ProductStatus;
  const notes = parseText(formData, "notes");

  const allowed: ProductStatus[] = ["testing", "keep", "kill", "scale"];
  if (!allowed.includes(status)) throw new Error("Invalid product status.");

  const supabase = await createClient();
  const { error } = await supabase.from("mentorship_products").insert({
    enrollment_id: enrollmentId,
    name,
    status,
    notes: notes || null,
  });
  if (error) throw new Error("Could not add product.");
  revalidateMentorshipWorkspace(programId, enrollmentId);
}

export async function updateMentorshipProduct(programId: string, enrollmentId: string, formData: FormData) {
  await requireAdmin();
  const productId = parseText(formData, "product_id");
  if (!productId) throw new Error("Product is required.");

  const name = parseText(formData, "name");
  const status = parseText(formData, "status", "testing") as ProductStatus;
  const notes = parseText(formData, "notes");

  const allowed: ProductStatus[] = ["testing", "keep", "kill", "scale"];
  if (!allowed.includes(status)) throw new Error("Invalid product status.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("mentorship_products")
    .update({ name, status, notes: notes || null })
    .eq("id", productId)
    .eq("enrollment_id", enrollmentId);
  if (error) throw new Error("Could not update product.");
  revalidateMentorshipWorkspace(programId, enrollmentId);
}

export async function addMentorshipCall(programId: string, enrollmentId: string, formData: FormData) {
  await requireAdmin();
  const scheduledAt = parseText(formData, "scheduled_at");
  if (!scheduledAt) throw new Error("Call date/time is required.");
  const status = parseText(formData, "status", "scheduled");
  if (!ALLOWED_CALL_STATUSES.includes(status as CallStatus)) throw new Error("Invalid call status.");
  const meetingLink = parseText(formData, "meeting_link");
  const recordingUrl = parseText(formData, "recording_url");
  const callNotes = parseText(formData, "call_notes");

  const supabase = await createClient();
  const { error } = await supabase.from("mentorship_calls").insert({
    enrollment_id: enrollmentId,
    scheduled_at: scheduledAt,
    status,
    meeting_link: meetingLink || null,
    recording_url: recordingUrl || null,
    call_notes: callNotes || null,
  });
  if (error) throw new Error("Could not schedule call.");
  revalidateMentorshipWorkspace(programId, enrollmentId);
}

export async function updateMentorshipCall(programId: string, enrollmentId: string, formData: FormData) {
  await requireAdmin();
  const callId = parseText(formData, "call_id");
  if (!callId) throw new Error("Call is required.");
  const scheduledAt = parseText(formData, "scheduled_at");
  if (!scheduledAt) throw new Error("Call date/time is required.");
  const status = parseText(formData, "status", "scheduled");
  if (!ALLOWED_CALL_STATUSES.includes(status as CallStatus)) throw new Error("Invalid call status.");
  const meetingLink = parseText(formData, "meeting_link");
  const recordingUrl = parseText(formData, "recording_url");
  const callNotes = parseText(formData, "call_notes");

  const supabase = await createClient();
  const { error } = await supabase
    .from("mentorship_calls")
    .update({
      scheduled_at: scheduledAt,
      status,
      meeting_link: meetingLink || null,
      recording_url: recordingUrl || null,
      call_notes: callNotes || null,
    })
    .eq("id", callId)
    .eq("enrollment_id", enrollmentId);
  if (error) throw new Error("Could not update call.");
  revalidateMentorshipWorkspace(programId, enrollmentId);
}

// A single note-creation path for both a plain/internal mentor note and a
// student-visible "mentor direction" — never two competing note concepts.
// `is_direction=true` in the form is the only thing that distinguishes
// them; the row shape and RLS are otherwise identical. Setting a new
// direction never edits or deletes the previous one — history is
// preserved, and "latest wins" (the same pattern Phase E's effective-
// decision resolution already uses) is what the reader queries for.
export async function addMentorshipNote(programId: string, enrollmentId: string, formData: FormData) {
  const admin = await requireAdmin();
  const note = parseText(formData, "note");
  if (!note) throw new Error("Note cannot be empty.");
  const isDirection = formData.get("is_direction") === "true";

  const supabase = await createClient();
  const { error } = await supabase.from("mentorship_notes").insert({
    enrollment_id: enrollmentId,
    author_id: admin.id,
    note,
    is_mentor_direction: isDirection,
  });
  if (error) throw new Error("Could not add note.");
  if (isDirection) {
    await revalidateStudentDashboardToo(programId, enrollmentId);
  } else {
    revalidateMentorshipWorkspace(programId, enrollmentId);
  }
}

// ------------------------------------------------------- access lifecycle --
// Every action here is admin-only (enforced by requireAdmin()) AND enforced
// again by RLS (mentorship_profiles/mentorship_pause_history writes require
// is_admin()) — a student can never reach these regardless of what the
// client sends.

async function getMentorshipProfileOrThrow(supabase: Awaited<ReturnType<typeof createClient>>, enrollmentId: string) {
  const { data: profile } = await supabase
    .from("mentorship_profiles")
    .select("*")
    .eq("enrollment_id", enrollmentId)
    .maybeSingle();
  if (!profile) throw new Error("Mentorship access record not found.");
  return profile;
}

export async function pauseMentorshipAccess(programId: string, enrollmentId: string) {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const profile = await getMentorshipProfileOrThrow(supabase, enrollmentId);

  if (profile.access_status !== "active") {
    throw new Error("Only active mentorship access can be paused.");
  }

  const pausedAt = new Date().toISOString();

  const { error } = await supabase
    .from("mentorship_profiles")
    .update({ access_status: "paused", paused_at: pausedAt })
    .eq("enrollment_id", enrollmentId);
  if (error) throw new Error("Could not pause mentorship access.");

  const { error: historyError } = await supabase.from("mentorship_pause_history").insert({
    enrollment_id: enrollmentId,
    paused_at: pausedAt,
    paused_by: admin.id,
  });
  if (historyError) throw new Error("Could not record pause history.");

  revalidateMentorshipWorkspace(programId, enrollmentId);
}

export async function resumeMentorshipAccess(programId: string, enrollmentId: string) {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const profile = await getMentorshipProfileOrThrow(supabase, enrollmentId);

  if (profile.access_status !== "paused" || !profile.paused_at) {
    throw new Error("Only paused mentorship access can be resumed.");
  }

  const resumedAt = new Date();
  const pausedDays = computePausedDays(profile.paused_at, resumedAt);
  const newEndDate = profile.end_date ? addDaysToIsoDate(profile.end_date, pausedDays) : profile.end_date;

  const { error } = await supabase
    .from("mentorship_profiles")
    .update({ access_status: "active", paused_at: null, end_date: newEndDate })
    .eq("enrollment_id", enrollmentId);
  if (error) throw new Error("Could not resume mentorship access.");

  const { data: openPause } = await supabase
    .from("mentorship_pause_history")
    .select("id")
    .eq("enrollment_id", enrollmentId)
    .is("resumed_at", null)
    .order("paused_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openPause) {
    const { error: historyError } = await supabase
      .from("mentorship_pause_history")
      .update({ resumed_at: resumedAt.toISOString(), resumed_by: admin.id })
      .eq("id", openPause.id);
    if (historyError) throw new Error("Could not close out pause history.");
  }

  revalidateMentorshipWorkspace(programId, enrollmentId);
}

export async function revokeMentorshipAccess(programId: string, enrollmentId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const profile = await getMentorshipProfileOrThrow(supabase, enrollmentId);

  if (profile.access_status === "revoked") {
    throw new Error("Access is already revoked.");
  }

  const { error } = await supabase
    .from("mentorship_profiles")
    .update({ access_status: "revoked" })
    .eq("enrollment_id", enrollmentId);
  if (error) throw new Error("Could not revoke mentorship access.");
  revalidateMentorshipWorkspace(programId, enrollmentId);
}

export async function restoreMentorshipAccess(programId: string, enrollmentId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const profile = await getMentorshipProfileOrThrow(supabase, enrollmentId);

  if (profile.access_status !== "revoked") {
    throw new Error("Only revoked mentorship access can be restored.");
  }

  // If the student was mid-pause at the moment they were revoked, restore
  // them back into that same paused state rather than silently un-pausing
  // them — their frozen remaining-days figure is preserved either way.
  const restoredStatus = profile.paused_at ? "paused" : "active";

  const { error } = await supabase
    .from("mentorship_profiles")
    .update({ access_status: restoredStatus })
    .eq("enrollment_id", enrollmentId);
  if (error) throw new Error("Could not restore mentorship access.");
  revalidateMentorshipWorkspace(programId, enrollmentId);
}

export async function extendMentorshipAccess(programId: string, enrollmentId: string, additionalDays: number) {
  await requireAdmin();
  const days = Math.floor(additionalDays);
  if (!Number.isFinite(days) || days <= 0) throw new Error("Extension must be a positive number of days.");

  const supabase = await createClient();
  const profile = await getMentorshipProfileOrThrow(supabase, enrollmentId);
  if (!profile.end_date) throw new Error("This access record has no end date to extend.");

  const { error } = await supabase
    .from("mentorship_profiles")
    .update({
      end_date: addDaysToIsoDate(profile.end_date, days),
      duration_days: (profile.duration_days ?? 0) + days,
    })
    .eq("enrollment_id", enrollmentId);
  if (error) throw new Error("Could not extend mentorship access.");
  revalidateMentorshipWorkspace(programId, enrollmentId);
}

// ------------------------------------------------------------------- payments --
export async function addMentorshipPayment(programId: string, enrollmentId: string, formData: FormData) {
  const admin = await requireAdmin();
  const amountInPaise = Math.round(parseNumber(formData, "amount") * 100);
  if (amountInPaise < 0) throw new Error("Amount cannot be negative.");
  const dueDate = parseText(formData, "due_date");
  if (!dueDate) throw new Error("Due date is required.");
  const razorpayLink = parseText(formData, "razorpay_link");
  const notes = parseText(formData, "notes");

  const supabase = await createClient();
  const { error } = await supabase.from("mentorship_payments").insert({
    enrollment_id: enrollmentId,
    amount: amountInPaise,
    due_date: dueDate,
    razorpay_link: razorpayLink || null,
    notes: notes || null,
    created_by: admin.id,
  });
  if (error) throw new Error("Could not add payment.");
  revalidateMentorshipWorkspace(programId, enrollmentId);
}

export async function updateMentorshipPayment(programId: string, enrollmentId: string, formData: FormData) {
  await requireAdmin();
  const paymentId = parseText(formData, "payment_id");
  if (!paymentId) throw new Error("Payment is required.");

  const amountInPaise = Math.round(parseNumber(formData, "amount") * 100);
  if (amountInPaise < 0) throw new Error("Amount cannot be negative.");
  const dueDate = parseText(formData, "due_date");
  if (!dueDate) throw new Error("Due date is required.");
  const razorpayLink = parseText(formData, "razorpay_link");
  const notes = parseText(formData, "notes");
  const status = parseText(formData, "status", "pending") as PaymentStatus;
  const allowed: PaymentStatus[] = ["pending", "paid", "overdue"];
  if (!allowed.includes(status)) throw new Error("Invalid payment status.");
  const paidDate = parseText(formData, "paid_date");

  const supabase = await createClient();
  const { error } = await supabase
    .from("mentorship_payments")
    .update({
      amount: amountInPaise,
      due_date: dueDate,
      razorpay_link: razorpayLink || null,
      notes: notes || null,
      status,
      paid_date: status === "paid" ? paidDate || todayIstIsoDate() : paidDate || null,
    })
    .eq("id", paymentId)
    .eq("enrollment_id", enrollmentId);
  if (error) throw new Error("Could not update payment.");
  revalidateMentorshipWorkspace(programId, enrollmentId);
}

export async function markMentorshipPaymentPaid(programId: string, enrollmentId: string, paymentId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("mentorship_payments")
    .update({ status: "paid", paid_date: todayIstIsoDate() })
    .eq("id", paymentId)
    .eq("enrollment_id", enrollmentId);
  if (error) throw new Error("Could not mark payment as paid.");
  revalidateMentorshipWorkspace(programId, enrollmentId);
}

