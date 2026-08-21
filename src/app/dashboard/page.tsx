import Link from "next/link";
import Image from "next/image";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCourseProgress } from "@/lib/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { BookOpen, ArrowRight } from "lucide-react";
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
  const [featured, ...rest] = coursesWithProgress;

  return (
    <div>
      <p className="eyebrow">Learn</p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
        Welcome back{user.profile.full_name ? `, ${user.profile.full_name.split(" ")[0]}` : ""}.
      </h1>

      {courses.length === 0 ? (
        <div className="mt-10">
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
          {featured && (
            <div className="mt-12">
              <p className="eyebrow">Continue Learning</p>
              <div className="mt-4 border-t border-ink-300 pt-6">
                <div className="grid gap-6 sm:grid-cols-[220px_1fr] sm:items-center">
                  <div className="relative aspect-video w-full overflow-hidden rounded-md bg-ink-100 sm:aspect-square">
                    {featured.course.thumbnail_url && (
                      <Image
                        src={featured.course.thumbnail_url}
                        alt={featured.course.title}
                        fill
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div>
                    <h2 className="font-display text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
                      {featured.course.title}
                    </h2>
                    {featured.course.subtitle && (
                      <p className="mt-2 max-w-lg text-ink-500">{featured.course.subtitle}</p>
                    )}
                    <div className="mt-5 flex items-center gap-3">
                      <div className="h-px w-24 overflow-hidden bg-ink-300">
                        <div className="h-full bg-brand-400" style={{ width: `${featured.progress.percent}%` }} />
                      </div>
                      <span className="font-mono text-xs text-ink-500">
                        {featured.progress.percent}% COMPLETE
                      </span>
                    </div>
                    <Link
                      href={
                        featured.progress.resumeLessonId
                          ? `/dashboard/learn/${featured.course.slug}/${featured.progress.resumeLessonId}`
                          : `/dashboard/learn/${featured.course.slug}`
                      }
                    >
                      <Button className="mt-6">
                        {featured.progress.percent > 0 ? "Continue Learning" : "Start Course"}
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          {rest.length > 0 && (
            <div className="mt-14">
              <p className="eyebrow">Your Courses</p>
              <div className="mt-4 divide-y divide-ink-300 border-t border-ink-300">
                {rest.map(({ course, progress }) => (
                  <Link
                    key={course.id}
                    href={
                      progress.resumeLessonId
                        ? `/dashboard/learn/${course.slug}/${progress.resumeLessonId}`
                        : `/dashboard/learn/${course.slug}`
                    }
                    className="group flex items-center gap-4 py-4 transition-colors hover:bg-ink-100/60"
                  >
                    <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md bg-ink-100">
                      {course.thumbnail_url && (
                        <Image src={course.thumbnail_url} alt={course.title} fill className="object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-display font-semibold text-ink-900">{course.title}</h3>
                      <p className="font-mono text-xs text-ink-500">{progress.percent}% COMPLETE</p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-ink-500 transition-transform group-hover:translate-x-1" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
