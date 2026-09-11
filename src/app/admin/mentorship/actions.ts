"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { mentorshipProgramSchema } from "@/lib/validations";
import { slugify } from "@/lib/utils";
import { addDaysToIsoDate, todayIstIsoDate } from "@/lib/mentorship-access";

const MENTORSHIP_TYPE_ID = "mentorship";

function revalidateMentorshipProgram(programId: string) {
  revalidatePath(`/admin/mentorship/${programId}`);
  revalidatePath("/admin/mentorship");
}

async function uniqueProgramSlug(base: string): Promise<string> {
  const supabase = await createClient();
  const root = slugify(base) || "mentorship-program";
  let candidate = root;
  let suffix = 1;
  while (true) {
    const { data } = await supabase.from("programs").select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }
}

export async function createMentorshipProgram() {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const slug = await uniqueProgramSlug("untitled-mentorship");

  const { data: program, error } = await supabase
    .from("programs")
    .insert({
      type_id: MENTORSHIP_TYPE_ID,
      title: "Untitled Mentorship Program",
      slug,
      created_by: admin.id,
    })
    .select()
    .single();

  if (error || !program) throw new Error("Could not create mentorship program.");
  revalidatePath("/admin/mentorship");
  redirect(`/admin/mentorship/${program.id}`);
}

export async function updateMentorshipProgram(programId: string, formData: FormData) {
  await requireAdmin();
  const raw = Object.fromEntries(formData.entries());
  // The form collects price in rupees for a human-friendly input; the
  // database stores paise (INR minor unit) per DATABASE.md.
  const priceInPaise = Math.round(Number(raw.price || 0) * 100);
  const slug = slugify(String(raw.slug ?? ""));
  const parsed = mentorshipProgramSchema.safeParse({ ...raw, price: priceInPaise, slug });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input.");

  const supabase = await createClient();

  const { data: slugOwner } = await supabase
    .from("programs")
    .select("id")
    .eq("slug", parsed.data.slug)
    .maybeSingle();
  if (slugOwner && slugOwner.id !== programId) {
    throw new Error("That URL slug is already used by another program.");
  }

  const { error } = await supabase
    .from("programs")
    .update(parsed.data)
    .eq("id", programId)
    .eq("type_id", MENTORSHIP_TYPE_ID);
  if (error) throw new Error("Could not save mentorship program.");
  revalidateMentorshipProgram(programId);
}

export async function updateMentorshipThumbnail(programId: string, thumbnailUrl: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("programs")
    .update({ thumbnail_url: thumbnailUrl })
    .eq("id", programId)
    .eq("type_id", MENTORSHIP_TYPE_ID);
  if (error) throw new Error("Could not save thumbnail.");
  revalidateMentorshipProgram(programId);
}

export async function toggleMentorshipPublish(programId: string, publish: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("programs")
    .update({
      status: publish ? "published" : "draft",
      published_at: publish ? new Date().toISOString() : null,
    })
    .eq("id", programId)
    .eq("type_id", MENTORSHIP_TYPE_ID);
  if (error) throw new Error("Could not update program status.");
  revalidateMentorshipProgram(programId);
}

// ---------------------------------------------------- student onboarding --
// This is a manual, admin-only activation flow — there is no checkout for
// mentorship. The admin qualifies the student on WhatsApp, collects payment
// via a manually-created Razorpay Payment Link outside this platform, then
// looks the student up here by email and activates access directly.

export interface StudentLookupResult {
  id: string;
  email: string;
  fullName: string | null;
}

export async function lookupStudentByEmail(email: string): Promise<StudentLookupResult | null> {
  await requireAdmin();
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const admin = createAdminClient();
  // supabase-js v2 has no direct getUserByEmail; listUsers + filter matches
  // the existing pattern already used on /admin/students.
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const match = (data?.users ?? []).find((u) => u.email?.toLowerCase() === normalized);
  if (!match) return null;

  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", match.id).maybeSingle();

  return { id: match.id, email: match.email ?? normalized, fullName: profile?.full_name ?? null };
}

export async function approveMentorshipStudent(
  programId: string,
  input: { userId: string; durationDays: number; startDate?: string }
) {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const durationDays = Math.floor(input.durationDays);
  if (!Number.isFinite(durationDays) || durationDays <= 0) {
    throw new Error("Duration must be a positive number of days.");
  }

  const { data: program } = await supabase
    .from("programs")
    .select("id")
    .eq("id", programId)
    .eq("type_id", MENTORSHIP_TYPE_ID)
    .maybeSingle();
  if (!program) throw new Error("Mentorship program not found.");

  const { data: existingEnrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", input.userId)
    .eq("program_id", programId)
    .maybeSingle();
  if (existingEnrollment) {
    throw new Error("This student already has access to this mentorship program.");
  }

  const { data: enrollment, error: enrollmentError } = await supabase
    .from("enrollments")
    .insert({ user_id: input.userId, program_id: programId, course_id: null, order_id: null })
    .select("id")
    .single();
  if (enrollmentError || !enrollment) {
    throw new Error("Could not create enrollment — the student may already have access.");
  }

  const startDate = input.startDate || todayIstIsoDate();
  const endDate = addDaysToIsoDate(startDate, durationDays);

  const { error: profileError } = await supabase.from("mentorship_profiles").insert({
    enrollment_id: enrollment.id,
    current_stage: "discovery",
    access_status: "active",
    start_date: startDate,
    end_date: endDate,
    duration_days: durationDays,
  });
  if (profileError) throw new Error("Could not activate mentorship access.");

  revalidateMentorshipProgram(programId);
  redirect(`/admin/mentorship/${programId}/students/${enrollment.id}`);
}
