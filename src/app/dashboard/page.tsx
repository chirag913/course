import Link from "next/link";
import Image from "next/image";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCourseProgress } from "@/lib/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import type { Course } from "@/types/database";

export default async function MyCoursesPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("course_id, courses(*)")
    .eq("user_id", user.id)
    .order("enrolled_at", { ascending: false });

  const courses = (enrollments ?? [])
    .map((e) => e.courses as unknown as Course)
    .filter(Boolean);

  const progressList = await Promise.all(
    courses.map((course) => getCourseProgress(user.id, course.id))
  );
  const coursesWithProgress = courses.map((course, i) => ({ course, progress: progressList[i]! }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">
        Welcome back{user.profile.full_name ? `, ${user.profile.full_name.split(" ")[0]}` : ""}
      </h1>

      {courses.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={BookOpen}
            title="You haven't purchased any courses yet"
            description="Browse the catalog to find a course to start learning."
            action={
              <Link href="/">
                <Button>Browse courses</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-ink-400">
            Continue Learning
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {coursesWithProgress.map(({ course, progress }) => {
              const continueHref = progress.resumeLessonId
                ? `/dashboard/learn/${course.slug}/${progress.resumeLessonId}`
                : `/dashboard/learn/${course.slug}`;
              return (
                <div
                  key={course.id}
                  className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-subtle"
                >
                  <div className="relative aspect-video w-full bg-ink-100">
                    {course.thumbnail_url && (
                      <Image src={course.thumbnail_url} alt={course.title} fill className="object-cover" />
                    )}
                  </div>
                  <div className="p-5">
                    <h3 className="line-clamp-2 font-semibold text-ink-900">{course.title}</h3>
                    <div className="mt-3">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                        <div
                          className="h-full rounded-full bg-brand-600 transition-all"
                          style={{ width: `${progress.percent}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-xs font-medium text-ink-500">
                        {progress.percent}% Complete
                      </p>
                    </div>
                    <Link href={continueHref}>
                      <Button className="mt-4 w-full" size="sm">
                        {progress.percent > 0 ? "Continue Learning" : "Start Course"}
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
