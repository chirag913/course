import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPrice } from "@/lib/utils";
import { BookOpen, Plus } from "lucide-react";
import { createCourse } from "./actions";
import { CourseRowActions } from "./course-row-actions";
import type { Course } from "@/types/database";

export default async function AdminCoursesPage() {
  const supabase = await createClient();
  const { data: courses } = await supabase
    .from("courses")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: enrollments } = await supabase.from("enrollments").select("course_id");
  const studentCounts = new Map<string, number>();
  for (const e of enrollments ?? []) {
    studentCounts.set(e.course_id, (studentCounts.get(e.course_id) ?? 0) + 1);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">Courses</h1>
        <form action={createCourse}>
          <Button type="submit">
            <Plus className="h-4 w-4" /> New Course
          </Button>
        </form>
      </div>

      <div className="mt-6">
        {courses && courses.length > 0 ? (
          <div className="border-t border-ink-300">
            <div className="divide-y divide-ink-300">
              {(courses as Course[]).map((course) => (
                <div key={course.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display font-semibold text-ink-900">{course.title}</h3>
                      <Badge tone={course.status === "published" ? "success" : "neutral"}>
                        {course.status === "published" ? "Published" : "Draft"}
                      </Badge>
                    </div>
                    <p className="mt-1 font-mono text-xs text-ink-500">
                      {formatPrice(course.price, course.currency)} · {studentCounts.get(course.id) ?? 0}{" "}
                      STUDENTS
                    </p>
                  </div>
                  <CourseRowActions courseId={course.id} slug={course.slug} status={course.status} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={BookOpen}
            title="No courses yet"
            description="Create your first course to get started."
            action={
              <form action={createCourse}>
                <Button type="submit">
                  <Plus className="h-4 w-4" /> New Course
                </Button>
              </form>
            }
          />
        )}
      </div>
    </div>
  );
}
