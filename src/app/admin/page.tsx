import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPrice, formatCurrency, formatDate } from "@/lib/utils";
import { IndianRupee, Users, BookOpen, ShoppingCart, Receipt } from "lucide-react";

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [{ count: courseCount }, { data: paidOrders }, { data: enrollmentUsers }] = await Promise.all([
    supabase.from("courses").select("*", { count: "exact", head: true }),
    supabase.from("orders").select("amount").eq("status", "paid"),
    supabase.from("enrollments").select("user_id"),
  ]);

  const totalRevenue = (paidOrders ?? []).reduce((sum, o) => sum + o.amount, 0);
  const totalSales = (paidOrders ?? []).length;
  const totalStudents = new Set((enrollmentUsers ?? []).map((e) => e.user_id)).size;

  const { data: recentOrders } = await supabase
    .from("orders")
    .select("id, amount, currency, created_at, profiles(full_name), courses(title)")
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(8);

  const stats = [
    { label: "Total Revenue", value: formatCurrency(totalRevenue), icon: IndianRupee },
    { label: "Total Students", value: totalStudents, icon: Users },
    { label: "Total Courses", value: courseCount ?? 0, icon: BookOpen },
    { label: "Total Sales", value: totalSales, icon: ShoppingCart },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">Dashboard</h1>

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
