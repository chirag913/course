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
      <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
            Courses that get you results
          </h1>
          <p className="mt-3 text-lg text-ink-500">
            Practical, no-fluff courses. Learn at your own pace, keep access forever.
          </p>
        </div>

        <div className="mt-10">
          {courses && courses.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
