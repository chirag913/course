import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { createCourse } from "./actions";
import { CourseOrderManager } from "./course-order-manager";
import type { Course } from "@/types/database";

function isMissingDisplayOrderColumn(error: { code?: string | null } | null | undefined) {
  return error?.code === "42703";
}

export default async function AdminCoursesPage() {
  const supabase = await createClient();
  const { data: orderedCourses, error: orderedCoursesError } = await supabase
    .from("courses")
    .select("*")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });
  let courses: Course[];
  if (orderedCoursesError && !isMissingDisplayOrderColumn(orderedCoursesError)) {
    throw orderedCoursesError;
  }
  if (!orderedCoursesError) {
    courses = orderedCourses ?? [];
  } else {
    const { data: fallbackCourses, error: fallbackCoursesError } = await supabase
      .from("courses")
      .select("*")
      .order("created_at", { ascending: false });
    if (fallbackCoursesError) throw fallbackCoursesError;
    courses = fallbackCourses ?? [];
  }

  const { data: enrollments } = await supabase.from("enrollments").select("course_id");
  const studentCounts: Record<string, number> = {};
  for (const e of enrollments ?? []) {
    if (!e.course_id) continue;
    studentCounts[e.course_id] = (studentCounts[e.course_id] ?? 0) + 1;
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
        <CourseOrderManager courses={(courses ?? []) as Course[]} studentCounts={studentCounts} />
      </div>
    </div>
  );
}
