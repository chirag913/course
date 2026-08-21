import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPrice, formatDate } from "@/lib/utils";
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
    { label: "Total Revenue", value: formatPrice(totalRevenue), icon: IndianRupee },
    { label: "Total Students", value: totalStudents, icon: Users },
    { label: "Total Courses", value: courseCount ?? 0, icon: BookOpen },
    { label: "Total Sales", value: totalSales, icon: ShoppingCart },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Dashboard</h1>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-ink-400">
                <stat.icon className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">{stat.label}</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-ink-900">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-ink-400">
        Recent Purchases
      </h2>

      <Card className="mt-4">
        {recentOrders && recentOrders.length > 0 ? (
          <div className="divide-y divide-ink-100">
            {recentOrders.map((order) => {
              const profile = order.profiles as unknown as { full_name: string | null } | null;
              const course = order.courses as unknown as { title: string } | null;
              return (
                <div key={order.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium text-ink-900">
                      {profile?.full_name ?? "Student"} — {course?.title ?? "Course"}
                    </p>
                    <p className="text-xs text-ink-400">{formatDate(order.created_at)}</p>
                  </div>
                  <span className="text-sm font-semibold text-ink-900">
                    {formatPrice(order.amount, order.currency)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={Receipt} title="No purchases yet" className="border-0" />
        )}
      </Card>
    </div>
  );
}
