import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CourseProgress {
  totalLessons: number;
  completedLessons: number;
  percent: number;
  resumeLessonId: string | null;
}

// Total lesson count for a course (published lessons only).
async function getCourseLessonIds(
  supabase: SupabaseClient,
  courseId: string
): Promise<string[]> {
  const { data: sections } = await supabase
    .from("course_sections")
    .select("id")
    .eq("course_id", courseId)
    .order("position");

  const sectionIds = (sections ?? []).map((s) => s.id);
  if (sectionIds.length === 0) return [];

  const { data: lessons } = await supabase
    .from("lessons")
    .select("id")
    .in("course_section_id", sectionIds)
    .eq("is_published", true)
    .order("position");

  return (lessons ?? []).map((l) => l.id);
}

export async function getCourseProgress(userId: string, courseId: string): Promise<CourseProgress> {
  const supabase = await createClient();
  const lessonIds = await getCourseLessonIds(supabase, courseId);

  if (lessonIds.length === 0) {
    return { totalLessons: 0, completedLessons: 0, percent: 0, resumeLessonId: null };
  }

  const { data: progressRows } = await supabase
    .from("lesson_progress")
    .select("lesson_id, is_completed, last_viewed_at")
    .eq("user_id", userId)
    .eq("course_id", courseId);

  const completedLessons = (progressRows ?? []).filter((p) => p.is_completed).length;
  const percent = Math.round((completedLessons / lessonIds.length) * 100);

  const mostRecent = (progressRows ?? [])
    .filter((p) => !p.is_completed)
    .sort((a, b) => new Date(b.last_viewed_at).getTime() - new Date(a.last_viewed_at).getTime())[0];

  // Resume on the most recently viewed incomplete lesson, or the first
  // lesson overall if nothing has been started yet.
  const resumeLessonId = mostRecent?.lesson_id ?? lessonIds[0] ?? null;

  return { totalLessons: lessonIds.length, completedLessons, percent, resumeLessonId };
}
