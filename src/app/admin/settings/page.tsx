import { createClient } from "@/lib/supabase/server";
import { CouponsManager } from "@/components/admin/coupons-manager";
import type { Coupon } from "@/types/database";

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const { data: coupons } = await supabase.from("coupons").select("*").order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">Settings</h1>
      <div className="mt-6">
        <CouponsManager coupons={(coupons ?? []) as Coupon[]} />
      </div>
    </div>
  );
}
