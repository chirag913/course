import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCourseProgress } from "@/lib/progress";

// Entry point for "Continue Learning" / "Start Course" without a specific
// lesson id — resolves to the right lesson and redirects.
export default async function LearnCourseEntryPage({
  params,
}: {
  params: Promise<{ courseSlug: string }>;
}) {
  const { courseSlug } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: course } = await supabase
    .from("courses")
    .select("id, slug")
    .eq("slug", courseSlug)
    .single();
  if (!course) notFound();

  const progress = await getCourseProgress(user.id, course.id);
  if (!progress.resumeLessonId) notFound();

  redirect(`/dashboard/learn/${courseSlug}/${progress.resumeLessonId}`);
}
