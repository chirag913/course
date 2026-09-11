import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { MentorshipProgramForm } from "@/components/admin/mentorship-program-form";
import { ApproveMentorshipStudentForm } from "@/components/admin/approve-mentorship-student-form";
import { formatDate, formatPrice } from "@/lib/utils";
import { getEffectiveMentorshipStatus, getRemainingDays } from "@/lib/mentorship-access";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { MentorshipPayment, MentorshipProfile, Program } from "@/types/database";

interface Props {
  params: Promise<{ programId: string }>;
}

const STATUS_TONE = {
  active: "success",
  paused: "warning",
  revoked: "warning",
  expired: "neutral",
} as const;

export default async function AdminMentorshipProgramPage({ params }: Props) {
  const { programId } = await params;
  const supabase = await createClient();

  const { data: program } = await supabase
    .from("programs")
    .select("*")
    .eq("id", programId)
    .eq("type_id", "mentorship")
    .maybeSingle<Program>();

  if (!program) notFound();

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id, enrolled_at, user_id, profiles(full_name)")
    .eq("program_id", program.id)
    .order("enrolled_at", { ascending: false });

  const enrollmentIds = (enrollments ?? []).map((e) => e.id);

  const [{ data: accessProfiles }, { data: payments }, { data: userList }] = await Promise.all([
    enrollmentIds.length
      ? supabase.from("mentorship_profiles").select("*").in("enrollment_id", enrollmentIds)
      : Promise.resolve({ data: [] as MentorshipProfile[] }),
    enrollmentIds.length
      ? supabase
          .from("mentorship_payments")
          .select("*")
          .in("enrollment_id", enrollmentIds)
          .neq("status", "paid")
          .order("due_date", { ascending: true })
      : Promise.resolve({ data: [] as MentorshipPayment[] }),
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const accessByEnrollment = new Map((accessProfiles ?? []).map((a) => [a.enrollment_id, a as MentorshipProfile]));
  const nextPaymentByEnrollment = new Map<string, MentorshipPayment>();
  for (const payment of (payments ?? []) as MentorshipPayment[]) {
    if (!nextPaymentByEnrollment.has(payment.enrollment_id)) {
      nextPaymentByEnrollment.set(payment.enrollment_id, payment);
    }
  }
  const emailById = new Map((userList?.users ?? []).map((u) => [u.id, u.email ?? ""]));

  return (
    <div>
      <Link href="/admin/mentorship" className="mb-5 block text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="mr-1 inline h-3.5 w-3.5" />
        Back to mentorship programs
      </Link>

      <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">{program.title}</h1>
      <p className="mt-1 font-mono text-sm text-ink-500">/{program.slug}</p>

      <div className="mt-8 border-t border-ink-300 pt-8">
        <MentorshipProgramForm program={program} />
      </div>

      <div className="mt-10 flex items-center justify-between border-t border-ink-300 pt-8">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Students</p>
        <ApproveMentorshipStudentForm programId={program.id} />
      </div>

      {enrollments && enrollments.length > 0 ? (
        <div className="mt-4 border-t border-ink-300">
          <div className="divide-y divide-ink-300">
            {enrollments.map((enrollment) => {
              const profile = enrollment.profiles as unknown as { full_name: string | null } | null;
              const access = accessByEnrollment.get(enrollment.id);
              const nextPayment = nextPaymentByEnrollment.get(enrollment.id);
              const effectiveStatus = access ? getEffectiveMentorshipStatus(access) : null;
              const remainingDays = access ? getRemainingDays(access) : null;

              return (
                <Link
                  key={enrollment.id}
                  href={`/admin/mentorship/${program.id}/students/${enrollment.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-4 transition-colors hover:bg-ink-100/60"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">{profile?.full_name ?? "Unnamed student"}</p>
                    <p className="text-sm text-ink-500">{emailById.get(enrollment.user_id) ?? ""}</p>
                    {effectiveStatus && (
                      <p className="mt-1 flex items-center gap-2 font-mono text-xs text-ink-500">
                        <Badge tone={STATUS_TONE[effectiveStatus]}>{effectiveStatus}</Badge>
                        {remainingDays !== null && effectiveStatus === "active" && `${remainingDays} days remaining`}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    {nextPayment ? (
                      <p className="font-mono text-xs text-ink-500">
                        Next payment: {formatPrice(nextPayment.amount, nextPayment.currency)} · Due{" "}
                        {formatDate(nextPayment.due_date)} · {nextPayment.status}
                      </p>
                    ) : (
                      <p className="font-mono text-xs text-ink-500">No pending payments</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <EmptyState icon={ExternalLink} title="No students enrolled yet" description="Mentorship students will show here." />
      )}
    </div>
  );
}

