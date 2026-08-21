import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CurriculumSidebar } from "@/components/player/curriculum-sidebar";
import { LessonPlayer } from "@/components/player/lesson-player";
import type { Course, SectionWithLessons, LessonWithResources } from "@/types/database";

interface Props {
  params: Promise<{ courseSlug: string; lessonId: string }>;
}

export default async function CoursePlayerPage({ params }: Props) {
  const { courseSlug, lessonId } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: course } = await supabase
    .from("courses")
    .select("*")
    .eq("slug", courseSlug)
    .single<Course>();
  if (!course) notFound();

  const isAdmin = user.profile.role === "admin";
  if (!isAdmin) {
    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("id")
      .eq("user_id", user.id)
      .eq("course_id", course.id)
      .maybeSingle();
    if (!enrollment) redirect(`/courses/${courseSlug}`);
  }

  const { data: sections } = await supabase
    .from("course_sections")
    .select("*, lessons(*, lesson_resources(*))")
    .eq("course_id", course.id)
    .order("position");

  const sectionsWithLessons = (sections ?? []).map((s) => ({
    ...s,
    lessons: (s.lessons ?? [])
      .filter((l: LessonWithResources) => l.is_published)
      .sort((a: LessonWithResources, b: LessonWithResources) => a.position - b.position),
  })) as SectionWithLessons[];

  const flatLessons = sectionsWithLessons.flatMap((s) => s.lessons);
  const currentIndex = flatLessons.findIndex((l) => l.id === lessonId);
  if (currentIndex === -1) notFound();

  const currentLesson = flatLessons[currentIndex]!;
  const prevLessonId = currentIndex > 0 ? flatLessons[currentIndex - 1]!.id : null;
  const nextLessonId = currentIndex < flatLessons.length - 1 ? flatLessons[currentIndex + 1]!.id : null;

  const { data: progressRows } = await supabase
    .from("lesson_progress")
    .select("lesson_id, is_completed, last_position_seconds")
    .eq("user_id", user.id)
    .eq("course_id", course.id);

  const progressByLesson = new Map(
    (progressRows ?? []).map((p) => [p.lesson_id, p])
  );
  const completedLessonIds = new Set(
    (progressRows ?? []).filter((p) => p.is_completed).map((p) => p.lesson_id)
  );

  const currentProgress = progressByLesson.get(currentLesson.id);
  const overallPercent =
    flatLessons.length > 0 ? Math.round((completedLessonIds.size / flatLessons.length) * 100) : 0;
  const wasLastRemainingLesson =
    !completedLessonIds.has(currentLesson.id) && completedLessonIds.size + 1 >= flatLessons.length;

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-ink-500 hover:text-ink-900">
          ← My Courses
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-ink-900">{course.title}</h1>
          <div className="flex items-center gap-2">
            <div className="h-2 w-32 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${overallPercent}%` }} />
            </div>
            <span className="text-sm font-medium text-ink-500">{overallPercent}% Complete</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <LessonPlayer
          courseSlug={courseSlug}
          lesson={currentLesson}
          prevLessonId={prevLessonId}
          nextLessonId={nextLessonId}
          initialCompleted={currentProgress?.is_completed ?? false}
          initialPositionSeconds={currentProgress?.last_position_seconds ?? 0}
          wasLastRemainingLesson={wasLastRemainingLesson}
        />

        <CurriculumSidebar
          courseSlug={courseSlug}
          sections={sectionsWithLessons}
          currentLessonId={currentLesson.id}
          completedLessonIds={completedLessonIds}
        />
      </div>
    </div>
  );
}
