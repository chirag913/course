import type { SupabaseClient } from "@supabase/supabase-js";
import { rankTaskCandidates, selectWeeklyFocus } from "./generate";
import type { MentorshipTask } from "@/types/database";

// Reads currently-open tasks and applies the SAME ranking generation uses
// (rankTaskCandidates) — the dashboard's "This Week's Focus" ordering is
// never a second, independently-invented priority scheme.
export async function getWeeklyFocusTasks(supabase: SupabaseClient, enrollmentId: string): Promise<MentorshipTask[]> {
  const { data } = await supabase
    .from("mentorship_tasks")
    .select("*")
    .eq("enrollment_id", enrollmentId)
    .in("status", ["TODO", "IN_PROGRESS"])
    .order("created_at", { ascending: false });

  const tasks = (data ?? []) as MentorshipTask[];
  const ranked = rankTaskCandidates(
    tasks.map((t) => ({ ...t, reasonCode: t.reason_code, dedupKey: t.dedup_key }))
  );
  return selectWeeklyFocus(ranked);
}
