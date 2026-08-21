import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { Users } from "lucide-react";

export default async function AdminStudentsPage() {
  const admin = createAdminClient();
  const supabase = await createClient();

  const [{ data: userList }, { data: enrollments }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from("enrollments").select("user_id, course_id, enrolled_at, courses(title)"),
  ]);

  const enrollmentsByUser = new Map<string, { count: number; latest: string }>();
  for (const e of enrollments ?? []) {
    const existing = enrollmentsByUser.get(e.user_id);
    if (!existing || e.enrolled_at > existing.latest) {
      enrollmentsByUser.set(e.user_id, { count: (existing?.count ?? 0) + 1, latest: e.enrolled_at });
    } else {
      enrollmentsByUser.set(e.user_id, { count: existing.count + 1, latest: existing.latest });
    }
  }

  const { data: profiles } = await supabase.from("profiles").select("id, full_name, role").eq("role", "student");
  const profileNames = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const students = (userList?.users ?? [])
    .filter((u) => profileNames.has(u.id))
    .map((u) => ({
      id: u.id,
      email: u.email ?? "",
      fullName: profileNames.get(u.id) ?? null,
      courseCount: enrollmentsByUser.get(u.id)?.count ?? 0,
      latestPurchase: enrollmentsByUser.get(u.id)?.latest ?? null,
    }))
    .sort((a, b) => b.courseCount - a.courseCount);

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Students</h1>

      <div className="mt-6">
        {students.length > 0 ? (
          <Card className="overflow-hidden">
            <div className="divide-y divide-ink-100">
              {students.map((student) => (
                <Link
                  key={student.id}
                  href={`/admin/students/${student.id}`}
                  className="flex items-center justify-between gap-4 p-5 hover:bg-ink-50"
                >
                  <div>
                    <p className="font-medium text-ink-900">{student.fullName ?? "Unnamed"}</p>
                    <p className="text-sm text-ink-500">{student.email}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-medium text-ink-900">
                      {student.courseCount} course{student.courseCount !== 1 ? "s" : ""}
                    </p>
                    {student.latestPurchase && (
                      <p className="text-ink-400">Since {formatDate(student.latestPurchase)}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        ) : (
          <EmptyState icon={Users} title="No students yet" description="Students will show up here once they enroll in a course." />
        )}
      </div>
    </div>
  );
}
