import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCourseProgress } from "@/lib/progress";
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

      <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink-900">{profile.full_name ?? "Unnamed"}</h1>
      <p className="text-sm text-ink-500">{userResult.user.email}</p>

      <p className="eyebrow mt-8">Courses</p>
      <div className="mt-3 border-t border-ink-300">
        <div className="divide-y divide-ink-300">
          {courses.length === 0 && <p className="py-4 text-sm text-ink-500">Not enrolled in any courses yet.</p>}
          {courses.map((course, i) => (
            <div key={course.id} className="flex items-center justify-between py-4">
              <p className="font-medium text-ink-900">{course.title}</p>
              <span className="font-mono text-sm text-ink-500">{progressList[i]!.percent}% COMPLETE</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
