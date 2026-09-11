"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { addDaysToIsoDate, todayIstIsoDate } from "@/lib/mentorship-access";

type MentorshipPaymentStatus = "pending" | "paid" | "overdue";

function revalidateStudent(userId: string) {
  revalidatePath(`/admin/students/${userId}`);
  revalidatePath("/admin/students");
  revalidatePath("/admin");
}

function parseText(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);
  return value ? String(value).trim() : fallback;
}

function parseNumber(formData: FormData, key: string) {
  const value = formData.get(key);
  if (value === null || String(value).trim() === "") return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

// -------------------------------------------------------- course grant --
// Manual admin grant — not a purchase. No order/payment row is created,
// exactly like the existing mentorship activation flow. Reuses the same
// `enrollments` table and the same duplicate-prevention pattern as
// approveMentorshipStudent in admin/mentorship/actions.ts.
export async function assignCourseToStudent(userId: string, programId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { data: program } = await supabase
    .from("programs")
    .select("id")
    .eq("id", programId)
    .eq("type_id", "course")
    .maybeSingle();
  if (!program) throw new Error("Course not found.");

  const { data: existing } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", userId)
    .eq("program_id", programId)
    .maybeSingle();
  if (existing) throw new Error("This student already has access to this course.");

  const { error } = await supabase
    .from("enrollments")
    .insert({ user_id: userId, program_id: programId, course_id: programId, order_id: null });
  if (error) throw new Error("Could not grant course access — the student may already have it.");

  revalidateStudent(userId);
}

// ----------------------------------------------------- mentorship grant --
// Same enrollment + mentorship_profiles shape as approveMentorshipStudent
// (admin/mentorship/actions.ts), extended to optionally create a payment
// record and set the WhatsApp number in the same step. Payment status here
// is purely a manually-tracked record — it never gates access. Access is
// controlled exclusively by mentorship_profiles.access_status, exactly as
// everywhere else in the mentorship system.
export async function assignMentorshipToStudent(userId: string, programId: string, formData: FormData) {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const durationDays = Math.floor(parseNumber(formData, "duration_days") ?? 30);
  if (!Number.isFinite(durationDays) || durationDays <= 0) {
    throw new Error("Duration must be a positive number of days.");
  }

  const { data: program } = await supabase
    .from("programs")
    .select("id")
    .eq("id", programId)
    .eq("type_id", "mentorship")
    .maybeSingle();
  if (!program) throw new Error("Mentorship program not found.");

  const { data: existing } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", userId)
    .eq("program_id", programId)
    .maybeSingle();
  if (existing) throw new Error("This student already has access to this mentorship program.");

  const { data: enrollment, error: enrollmentError } = await supabase
    .from("enrollments")
    .insert({ user_id: userId, program_id: programId, course_id: null, order_id: null })
    .select("id")
    .single();
  if (enrollmentError || !enrollment) {
    throw new Error("Could not create enrollment — the student may already have access.");
  }

  const startDate = parseText(formData, "start_date") || todayIstIsoDate();
  const endDate = addDaysToIsoDate(startDate, durationDays);
  const whatsappPhone = parseText(formData, "whatsapp_phone");

  const { error: profileError } = await supabase.from("mentorship_profiles").insert({
    enrollment_id: enrollment.id,
    current_stage: "discovery",
    access_status: "active",
    start_date: startDate,
    end_date: endDate,
    duration_days: durationDays,
    whatsapp_phone: whatsappPhone || null,
  });
  if (profileError) throw new Error("Could not activate mentorship access.");

  const paymentAmount = parseNumber(formData, "payment_amount");
  if (paymentAmount !== null && paymentAmount > 0) {
    const status = (parseText(formData, "payment_status") || "pending") as MentorshipPaymentStatus;
    const dueDate = parseText(formData, "due_date") || endDate;
    const razorpayLink = parseText(formData, "razorpay_link");
    const notes = parseText(formData, "notes");

    const { error: paymentError } = await supabase.from("mentorship_payments").insert({
      enrollment_id: enrollment.id,
      amount: Math.round(paymentAmount * 100),
      due_date: dueDate,
      razorpay_link: razorpayLink || null,
      status,
      paid_date: status === "paid" ? todayIstIsoDate() : null,
      notes: notes || null,
      created_by: admin.id,
    });
    if (paymentError) throw new Error("Mentorship was activated, but the payment record could not be saved.");
  }

  revalidateStudent(userId);
  return { enrollmentId: enrollment.id as string };
}

// ------------------------------------------------------------- invite --
// Admin-created student who hasn't signed up yet. Uses Supabase's own
// invite mechanism — it creates the auth user and emails them a link to set
// their own password. This app never sees or stores a password for them.
export async function inviteStudent(fullName: string, email: string) {
  await requireAdmin();
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Email is required.");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(normalizedEmail, {
    data: { full_name: fullName.trim() || null },
  });
  if (error) throw new Error(error.message || "Could not invite this student.");

  revalidatePath("/admin/students");
  revalidatePath("/admin");
  return { userId: data.user.id };
}

// -------------------------------------------------------------- delete --
// Every user-owned table in this schema cascades from auth.users through
// profiles -> enrollments -> every mentorship/connection/product/economics/
// shipping/decision table (verified by reading every migration, not
// assumed) — so deleting the auth user is both correct and complete. The
// only non-cascading FKs are authorship references (created_by, paused_by,
// author_id), which correctly SET NULL and point at admins, not students.
export async function deleteStudentAccount(userId: string, confirmEmail: string) {
  const admin = await requireAdmin();
  if (userId === admin.id) throw new Error("You cannot delete your own account.");

  const supabase = await createClient();
  const { data: targetProfile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!targetProfile) throw new Error("Student not found.");
  if (targetProfile.role === "admin") throw new Error("Cannot delete an admin account through this action.");

  const adminClient = createAdminClient();
  const { data: targetUser } = await adminClient.auth.admin.getUserById(userId);
  if (!targetUser?.user) throw new Error("Student not found.");

  const actualEmail = targetUser.user.email ?? "";
  if (!actualEmail || confirmEmail.trim() !== actualEmail) {
    throw new Error("The email you typed doesn't match this student's email exactly.");
  }

  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) throw new Error("Could not delete this student's account.");

  revalidatePath("/admin/students");
  revalidatePath("/admin");
}
