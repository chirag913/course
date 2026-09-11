import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice, formatCurrency, formatDate } from "@/lib/utils";
import { getEffectiveMentorshipStatus } from "@/lib/mentorship-access";
import { IndianRupee, Users, BookOpen, ShoppingCart, Receipt } from "lucide-react";
import type { MentorshipEffectiveStatus, MentorshipProfile } from "@/types/database";

type ProgramJoin = { title: string; type_id: string } | null;

function asSingle<T>(row: T | T[] | null): T | null {
  if (!row) return null;
  return Array.isArray(row) ? (row[0] ?? null) : row;
}

const STATUS_TONE: Record<MentorshipEffectiveStatus, "success" | "warning" | "neutral"> = {
  active: "success",
  paused: "warning",
  revoked: "warning",
  expired: "neutral",
};

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const admin = createAdminClient();

  const [{ count: courseCount }, { data: paidOrders }, { data: enrollmentUsers }] = await Promise.all([
    supabase.from("courses").select("*", { count: "exact", head: true }),
    supabase.from("orders").select("amount").eq("status", "paid"),
    supabase.from("enrollments").select("user_id"),
  ]);

  const totalRevenue = (paidOrders ?? []).reduce((sum, o) => sum + o.amount, 0);
  const totalSales = (paidOrders ?? []).length;
  const totalStudents = new Set((enrollmentUsers ?? []).map((e) => e.user_id)).size;

  const [{ data: recentOrders }, { data: recentProfiles }, { data: userList }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, amount, currency, created_at, profiles(full_name), courses(title)")
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("profiles")
      .select("id, full_name, created_at")
      .neq("role", "admin")
      .order("created_at", { ascending: false })
      .limit(6),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const emailById = new Map((userList?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  const recentProfileIds = (recentProfiles ?? []).map((p) => p.id);

  const { data: recentEnrollments } = recentProfileIds.length
    ? await supabase
        .from("enrollments")
        .select("id, user_id, enrolled_at, programs(title, type_id)")
        .in("user_id", recentProfileIds)
        .order("enrolled_at", { ascending: false })
    : { data: [] as never[] };

  const enrollmentByUser = new Map<string, { id: string; title: string; typeId: string }>();
  for (const e of (recentEnrollments ?? []) as unknown as Array<{
    id: string;
    user_id: string;
    programs: ProgramJoin | ProgramJoin[];
  }>) {
    if (enrollmentByUser.has(e.user_id)) continue;
    const program = asSingle(e.programs);
    if (program) enrollmentByUser.set(e.user_id, { id: e.id, title: program.title, typeId: program.type_id });
  }

  const mentorshipEnrollmentIds = [...enrollmentByUser.entries()]
    .filter(([, v]) => v.typeId === "mentorship")
    .map(([, v]) => v.id);
  const { data: mentorshipProfiles } = mentorshipEnrollmentIds.length
    ? await supabase.from("mentorship_profiles").select("*").in("enrollment_id", mentorshipEnrollmentIds)
    : { data: [] as MentorshipProfile[] };
  const statusByEnrollment = new Map(
    (mentorshipProfiles ?? []).map((m) => [m.enrollment_id, getEffectiveMentorshipStatus(m as MentorshipProfile)])
  );

  const stats = [
    { label: "Total Revenue", value: formatCurrency(totalRevenue), icon: IndianRupee },
    { label: "Total Students", value: totalStudents, icon: Users },
    { label: "Total Courses", value: courseCount ?? 0, icon: BookOpen },
    { label: "Total Sales", value: totalSales, icon: ShoppingCart },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">Dashboard</h1>
        <Link href="/admin/students">
          <Button size="sm">
            <Users className="h-4 w-4" />
            Students
          </Button>
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 divide-x divide-y divide-ink-300 border border-ink-300 lg:grid-cols-4 lg:divide-y-0">
        {stats.map((stat) => (
          <div key={stat.label} className="p-5">
            <div className="flex items-center gap-2 text-ink-500">
              <stat.icon className="h-3.5 w-3.5" />
              <span className="font-mono text-[11px] uppercase tracking-wide">{stat.label}</span>
            </div>
            <p className="mt-2 font-display text-2xl font-bold text-ink-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 flex items-center justify-between">
        <p className="eyebrow">Recent Students</p>
        <Link href="/admin/students" className="text-sm font-medium text-brand-300 hover:underline">
          View all →
        </Link>
      </div>

      <div className="mt-4 border-t border-ink-300">
        {recentProfiles && recentProfiles.length > 0 ? (
          <div className="divide-y divide-ink-300">
            {recentProfiles.map((p) => {
              const enrollment = enrollmentByUser.get(p.id);
              const status = enrollment ? statusByEnrollment.get(enrollment.id) : null;
              return (
                <Link
                  key={p.id}
                  href={`/admin/students/${p.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5 transition-colors hover:bg-ink-100/60"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">{p.full_name ?? "Unnamed"}</p>
                    <p className="text-xs text-ink-500">{emailById.get(p.id) ?? ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {enrollment ? (
                      <Badge tone={status ? STATUS_TONE[status] : "brand"}>
                        {enrollment.title}
                        {status ? ` · ${status}` : ""}
                      </Badge>
                    ) : (
                      <Badge>No program</Badge>
                    )}
                    <span className="font-mono text-xs text-ink-500">{formatDate(p.created_at)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={Users} title="No students yet" className="border-0 border-b" />
        )}
      </div>

      <p className="eyebrow mt-10">Recent Purchases</p>

      <div className="mt-4 border-t border-ink-300">
        {recentOrders && recentOrders.length > 0 ? (
          <div className="divide-y divide-ink-300">
            {recentOrders.map((order) => {
              const profile = order.profiles as unknown as { full_name: string | null } | null;
              const course = order.courses as unknown as { title: string } | null;
              return (
                <div key={order.id} className="flex items-center justify-between py-3.5">
                  <div>
                    <p className="text-sm font-medium text-ink-900">
                      {profile?.full_name ?? "Student"} — {course?.title ?? "Course"}
                    </p>
                    <p className="font-mono text-xs text-ink-500">{formatDate(order.created_at)}</p>
                  </div>
                  <span className="font-mono text-sm font-semibold text-ink-900">
                    {formatPrice(order.amount, order.currency)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={Receipt} title="No purchases yet" className="border-0 border-b" />
        )}
      </div>
    </div>
  );
}
