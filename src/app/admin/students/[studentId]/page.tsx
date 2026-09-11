import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCourseProgress } from "@/lib/progress";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MentorshipAccessPanel } from "@/components/admin/mentorship-access-panel";
import { MentorshipPaymentsPanel } from "@/components/admin/mentorship-payments-panel";
import { AssignProgramForm } from "@/components/admin/assign-program-form";
import { ArrowLeft, MessageCircle } from "lucide-react";
import type { MentorshipPayment, MentorshipProfile } from "@/types/database";

interface Props {
  params: Promise<{ studentId: string }>;
}

type ProgramJoin = { id: string; title: string; type_id: string; slug: string } | null;

function asSingle<T>(row: T | T[] | null): T | null {
  if (!row) return null;
  return Array.isArray(row) ? (row[0] ?? null) : row;
}

export default async function AdminStudentDetailPage({ params }: Props) {
  const { studentId } = await params;
  const admin = createAdminClient();
  const supabase = await createClient();

  const [{ data: userResult }, { data: profile }] = await Promise.all([
    admin.auth.admin.getUserById(studentId),
    supabase.from("profiles").select("*").eq("id", studentId).single(),
  ]);
  if (!userResult?.user || !profile) notFound();

  const [{ data: enrollments }, { data: allPrograms }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("id, program_id, course_id, enrolled_at, programs(id, title, type_id, slug)")
      .eq("user_id", studentId)
      .order("enrolled_at", { ascending: false }),
    supabase.from("programs").select("id, title, type_id, slug").order("title"),
  ]);

  const enrollmentRows = (enrollments ?? []) as unknown as Array<{
    id: string;
    program_id: string;
    course_id: string | null;
    enrolled_at: string;
    programs: ProgramJoin | ProgramJoin[];
  }>;

  const enrolledProgramIds = new Set(enrollmentRows.map((e) => e.program_id));
  const availablePrograms = (allPrograms ?? []).filter((p) => !enrolledProgramIds.has(p.id));

  const mentorshipEnrollments = enrollmentRows.filter((e) => asSingle(e.programs)?.type_id === "mentorship");
  const courseEnrollments = enrollmentRows.filter((e) => asSingle(e.programs)?.type_id === "course");
  const mentorshipEnrollmentIds = mentorshipEnrollments.map((e) => e.id);

  const [{ data: mentorshipProfiles }, { data: payments }] = await Promise.all([
    mentorshipEnrollmentIds.length
      ? supabase.from("mentorship_profiles").select("*").in("enrollment_id", mentorshipEnrollmentIds)
      : Promise.resolve({ data: [] as MentorshipProfile[] }),
    mentorshipEnrollmentIds.length
      ? supabase
          .from("mentorship_payments")
          .select("*")
          .in("enrollment_id", mentorshipEnrollmentIds)
          .order("due_date", { ascending: true })
      : Promise.resolve({ data: [] as MentorshipPayment[] }),
  ]);

  const mentorshipProfileByEnrollment = new Map(
    (mentorshipProfiles ?? []).map((m) => [m.enrollment_id, m as MentorshipProfile])
  );
  const paymentsByEnrollment = new Map<string, MentorshipPayment[]>();
  for (const payment of (payments ?? []) as MentorshipPayment[]) {
    const list = paymentsByEnrollment.get(payment.enrollment_id) ?? [];
    list.push(payment);
    paymentsByEnrollment.set(payment.enrollment_id, list);
  }

  const progressByEnrollment = new Map<string, number>();
  await Promise.all(
    courseEnrollments.map(async (e) => {
      const progress = await getCourseProgress(studentId, e.program_id);
      progressByEnrollment.set(e.id, progress.percent);
    })
  );

  const phoneOnFile = mentorshipEnrollments
    .map((e) => mentorshipProfileByEnrollment.get(e.id)?.whatsapp_phone)
    .find(Boolean);
  const whatsappUrl = phoneOnFile ? buildWhatsAppUrl(phoneOnFile) : null;

  return (
    <div>
      <Link href="/admin/students" className="flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="h-3.5 w-3.5" /> All students
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">
            {profile.full_name ?? "Unnamed"}
          </h1>
          <p className="text-sm text-ink-500">{userResult.user.email}</p>
          <p className="mt-1 font-mono text-xs text-ink-500">Joined {formatDate(profile.created_at)}</p>
        </div>
        {whatsappUrl && (
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </Button>
          </a>
        )}
      </div>

      <div className="mt-10 border-t border-ink-300 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="eyebrow">Programs</p>
          <AssignProgramForm userId={studentId} availablePrograms={availablePrograms} />
        </div>

        {enrollmentRows.length === 0 && <p className="mt-4 text-sm text-ink-500">No program assigned yet.</p>}

        <div className="mt-5 space-y-8">
          {enrollmentRows.map((e) => {
            const program = asSingle(e.programs);
            if (!program) return null;

            if (program.type_id === "mentorship") {
              const mentorshipProfile = mentorshipProfileByEnrollment.get(e.id);

              return (
                <div key={e.id} className="border border-ink-300 p-5">
                  <div>
                    <p className="font-display font-semibold text-ink-900">{program.title}</p>
                    <p className="font-mono text-[11px] uppercase tracking-wide text-ink-500">Mentorship</p>
                  </div>

                  {mentorshipProfile && (
                    <div className="mt-4">
                      <MentorshipAccessPanel programId={program.id} enrollmentId={e.id} profile={mentorshipProfile} />
                    </div>
                  )}

                  <div className="mt-4">
                    <MentorshipPaymentsPanel
                      programId={program.id}
                      enrollmentId={e.id}
                      payments={paymentsByEnrollment.get(e.id) ?? []}
                    />
                  </div>

                  <Link
                    href={`/admin/mentorship/${program.id}/students/${e.id}`}
                    className="mt-4 inline-block text-sm font-medium text-brand-300 hover:underline"
                  >
                    Open full mentorship workspace →
                  </Link>
                </div>
              );
            }

            return (
              <div key={e.id} className="border border-ink-300 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-display font-semibold text-ink-900">{program.title}</p>
                    <p className="font-mono text-[11px] uppercase tracking-wide text-ink-500">Course</p>
                  </div>
                  <span className="font-mono text-sm text-ink-500">
                    {progressByEnrollment.get(e.id) ?? 0}% complete
                  </span>
                </div>
                <p className="mt-2 font-mono text-xs text-ink-500">Enrolled {formatDate(e.enrolled_at)}</p>
                <Link
                  href={`/courses/${program.slug}`}
                  target="_blank"
                  className="mt-3 inline-block text-sm font-medium text-brand-300 hover:underline"
                >
                  View course page →
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
