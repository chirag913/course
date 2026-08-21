import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPrice, formatDate } from "@/lib/utils";
import { Receipt } from "lucide-react";
import type { OrderStatus } from "@/types/database";

const statusTone: Record<OrderStatus, "success" | "warning" | "neutral"> = {
  paid: "success",
  created: "warning",
  failed: "neutral",
  refunded: "neutral",
};

const statusLabel: Record<OrderStatus, string> = {
  paid: "Paid",
  created: "Pending",
  failed: "Failed",
  refunded: "Refunded",
};

export default async function AdminOrdersPage() {
  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("orders")
    .select("id, amount, currency, status, created_at, profiles(full_name), courses(title)")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">Orders</h1>

      <div className="mt-6">
        {orders && orders.length > 0 ? (
          <div className="overflow-x-auto border-t border-ink-300">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-300 text-left font-mono text-[11px] uppercase tracking-wide text-ink-500">
                  <th className="py-3 pr-4 font-medium">Order</th>
                  <th className="py-3 pr-4 font-medium">Customer</th>
                  <th className="py-3 pr-4 font-medium">Course</th>
                  <th className="py-3 pr-4 font-medium">Amount</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                  <th className="py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-300">
                {orders.map((order) => {
                  const profile = order.profiles as unknown as { full_name: string | null } | null;
                  const course = order.courses as unknown as { title: string } | null;
                  return (
                    <tr key={order.id}>
                      <td className="py-3.5 pr-4 font-mono text-xs text-ink-500">
                        #{order.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="py-3.5 pr-4 text-ink-800">{profile?.full_name ?? "—"}</td>
                      <td className="py-3.5 pr-4 text-ink-800">{course?.title ?? "—"}</td>
                      <td className="py-3.5 pr-4 font-mono font-medium text-ink-900">
                        {formatPrice(order.amount, order.currency)}
                      </td>
                      <td className="py-3.5 pr-4">
                        <Badge tone={statusTone[order.status as OrderStatus]}>
                          {statusLabel[order.status as OrderStatus]}
                        </Badge>
                      </td>
                      <td className="py-3.5 font-mono text-xs text-ink-500">{formatDate(order.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Receipt} title="No orders yet" />
        )}
      </div>
    </div>
  );
}
