"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { generateWeeklyTasks } from "@/lib/tasks/generate-runner";
import type { MentorshipTaskStatus } from "@/types/database";

// Mirrors the identical helper used across every other mentorship route's
// actions.ts — re-derives ownership from the enrollment row via the
// RLS-scoped client rather than trusting the enrollmentId argument.
async function requireOwnEnrollment(enrollmentId: string) {
  await requireUser();
  const supabase = await createClient();
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, programs(slug)")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!enrollment) throw new Error("Mentorship access not found.");
  const slugValue = enrollment.programs as unknown as { slug: string } | { slug: string }[] | null;
  const slug = Array.isArray(slugValue) ? slugValue[0]?.slug : slugValue?.slug;
  if (!slug) throw new Error("Mentorship program not found.");
  return { slug };
}

// Students can only ever change status/is_done/completed_at — enforced not
// just here but at the database level (0011's column-level GRANT means the
// shared `authenticated` role literally cannot write any other column of
// this table, even via a raw API call). Title/priority/source/mentor notes
// stay mentor-only regardless of what a client sends.
export async function updateTaskStatus(enrollmentId: string, taskId: string, status: MentorshipTaskStatus) {
  const { slug } = await requireOwnEnrollment(enrollmentId);
  const supabase = await createClient();

  const { error } = await supabase
    .from("mentorship_tasks")
    .update({
      status,
      is_done: status === "DONE",
      completed_at: status === "DONE" ? new Date().toISOString() : null,
    })
    .eq("id", taskId)
    .eq("enrollment_id", enrollmentId);
  if (error) throw new Error("Could not update this task.");
  revalidatePath(`/dashboard/mentorship/${slug}`);
}

// Student-triggerable (the engine's judgment doesn't depend on who asks
// for it — same pattern as Phase E's evaluateProductDecision), but always
// reads through the caller's own RLS-scoped session; nothing here needs
// service-role since generated tasks aren't secret the way OAuth tokens or
// decision records are.
export async function runWeeklyTaskGeneration(enrollmentId: string) {
  const { slug } = await requireOwnEnrollment(enrollmentId);
  const supabase = await createClient();
  const result = await generateWeeklyTasks(supabase, enrollmentId);
  revalidatePath(`/dashboard/mentorship/${slug}`);
  return result;
}
