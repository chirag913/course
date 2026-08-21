import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCourseProgress } from "@/lib/progress";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import type { Course } from "@/types/database";

interface Props {
  params: Promise<{ studentId: string }>;
}

export default async function StudentDetailPage({ params }: Props) {
  const { studentId } = await params;
  const admin = createAdminClient();
  const supabase = await createClient();

  const { data: userResult } = await admin.auth.admin.getUserById(studentId);
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", studentId).single();
  if (!userResult?.user || !profile) notFound();

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("course_id, enrolled_at, courses(*)")
    .eq("user_id", studentId)
    .order("enrolled_at", { ascending: false });

  const courses = (enrollments ?? []).map((e) => e.courses as unknown as Course).filter(Boolean);
  const progressList = await Promise.all(courses.map((c) => getCourseProgress(studentId, c.id)));

  return (
    <div>
      <Link href="/admin/students" className="flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="h-3.5 w-3.5" /> All students
      </Link>

      <h1 className="mt-2 text-2xl font-bold text-ink-900">{profile.full_name ?? "Unnamed"}</h1>
      <p className="text-sm text-ink-500">{userResult.user.email}</p>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-ink-400">Courses</h2>
      <Card className="mt-3 overflow-hidden">
        <div className="divide-y divide-ink-100">
          {courses.length === 0 && <p className="p-5 text-sm text-ink-500">Not enrolled in any courses yet.</p>}
          {courses.map((course, i) => (
            <div key={course.id} className="flex items-center justify-between p-5">
              <p className="font-medium text-ink-900">{course.title}</p>
              <span className="text-sm font-medium text-ink-500">{progressList[i]!.percent}% complete</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
