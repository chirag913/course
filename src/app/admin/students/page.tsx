import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveMentorshipStatus, getRemainingDays } from "@/lib/mentorship-access";
import { StudentsList, type StudentRow } from "@/components/admin/students-list";
import type { MentorshipProfile } from "@/types/database";

type EnrollmentJoinRow = {
  id: string;
  user_id: string;
  program_id: string;
  enrolled_at: string;
  programs: { id: string; title: string; type_id: string } | { id: string; title: string; type_id: string }[] | null;
};

function asSingle<T>(row: T | T[] | null): T | null {
  if (!row) return null;
  return Array.isArray(row) ? (row[0] ?? null) : row;
}

export default async function AdminStudentsPage() {
  const admin = createAdminClient();
  const supabase = await createClient();

  const [{ data: userList }, { data: profiles }, { data: enrollments }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from("profiles").select("id, full_name, role, created_at").neq("role", "admin"),
    supabase
      .from("enrollments")
      .select("id, user_id, program_id, enrolled_at, programs(id, title, type_id)")
      .order("enrolled_at", { ascending: false }),
  ]);

  const enrollmentRows = (enrollments ?? []) as unknown as EnrollmentJoinRow[];
  const mentorshipEnrollmentIds = enrollmentRows
    .filter((e) => asSingle(e.programs)?.type_id === "mentorship")
    .map((e) => e.id);

  const { data: mentorshipProfiles } = mentorshipEnrollmentIds.length
    ? await supabase.from("mentorship_profiles").select("*").in("enrollment_id", mentorshipEnrollmentIds)
    : { data: [] as MentorshipProfile[] };

  const accessByEnrollment = new Map((mentorshipProfiles ?? []).map((m) => [m.enrollment_id, m as MentorshipProfile]));
  const emailById = new Map((userList?.users ?? []).map((u) => [u.id, u.email ?? ""]));

  const enrollmentsByUser = new Map<string, EnrollmentJoinRow[]>();
  for (const e of enrollmentRows) {
    const list = enrollmentsByUser.get(e.user_id) ?? [];
    list.push(e);
    enrollmentsByUser.set(e.user_id, list);
  }

  const students: StudentRow[] = (profiles ?? []).map((p) => {
    const userEnrollments = enrollmentsByUser.get(p.id) ?? [];
    let phone: string | null = null;
    let latestActivity: string | null = null;

    const programs = userEnrollments.map((e) => {
      const program = asSingle(e.programs);
      const access = accessByEnrollment.get(e.id) ?? null;
      if (access?.whatsapp_phone && !phone) phone = access.whatsapp_phone;
      if (!latestActivity || e.enrolled_at > latestActivity) latestActivity = e.enrolled_at;

      return {
        enrollmentId: e.id,
        programId: program?.id ?? e.program_id,
        title: program?.title ?? "Untitled program",
        typeId: program?.type_id ?? "course",
        effectiveStatus: access ? getEffectiveMentorshipStatus(access) : null,
        remainingDays: access ? getRemainingDays(access) : null,
        enrolledAt: e.enrolled_at,
      };
    });

    return {
      id: p.id,
      fullName: p.full_name,
      email: emailById.get(p.id) ?? "",
      phone,
      joinedAt: p.created_at,
      latestActivity,
      programs,
    };
  });

  students.sort((a, b) => (a.joinedAt < b.joinedAt ? 1 : -1));

  return (
    <div>
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">Students</h1>
      <p className="mt-1 text-sm text-ink-500">
        Every signed-up student appears here, whether or not they have a program yet.
      </p>

      <div className="mt-6">
        <StudentsList students={students} />
      </div>
    </div>
  );
}
