"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { couponSchema } from "@/lib/validations";

export async function createCoupon(formData: FormData) {
  await requireAdmin();
  const raw = Object.fromEntries(formData.entries());
  // Fixed discounts are entered in rupees for a human-friendly input; the
  // database stores paise, matching how course prices are stored.
  const discountValue =
    raw.discount_type === "fixed" ? Math.round(Number(raw.discount_value || 0) * 100) : Number(raw.discount_value || 0);
  const parsed = couponSchema.safeParse({
    ...raw,
    discount_value: discountValue,
    is_active: true,
    max_uses: raw.max_uses ? raw.max_uses : null,
    expires_at: raw.expires_at ? raw.expires_at : null,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid coupon.");

  const supabase = await createClient();
  const { error } = await supabase.from("coupons").insert(parsed.data);
  if (error) {
    throw new Error(error.code === "23505" ? "A coupon with this code already exists." : "Could not create coupon.");
  }
  revalidatePath("/admin/settings");
}

export async function toggleCouponActive(couponId: string, isActive: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("coupons").update({ is_active: isActive }).eq("id", couponId);
  if (error) throw new Error("Could not update coupon.");
  revalidatePath("/admin/settings");
}

export async function deleteCoupon(couponId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("coupons").delete().eq("id", couponId);
  if (error) throw new Error("Could not delete coupon.");
  revalidatePath("/admin/settings");
}
