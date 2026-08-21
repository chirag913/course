import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { CourseCard } from "@/components/course-card";
import { EmptyState } from "@/components/ui/empty-state";
import { BookOpen } from "lucide-react";
import type { Course } from "@/types/database";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: courses } = await supabase
    .from("courses")
    .select("*")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  return (
    <div className="min-h-screen bg-ink-50">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <p className="eyebrow">Courses</p>
          <h1 className="mt-3 font-display text-4xl font-bold leading-[1.05] tracking-tightest text-ink-900 sm:text-5xl">
            Practical courses that get you results.
          </h1>
          <p className="mt-4 text-lg text-ink-500">
            No fluff. No &ldquo;get rich in 30 days.&rdquo; Learn at your own pace, keep access forever.
          </p>
        </div>

        <div className="mt-16 border-t border-ink-300 pt-12">
          {courses && courses.length > 0 ? (
            <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {(courses as Course[]).map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={BookOpen}
              title="No courses published yet"
              description="Check back soon — new courses are on the way."
            />
          )}
        </div>
      </main>
    </div>
  );
}
