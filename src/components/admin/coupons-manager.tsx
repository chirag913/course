"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Tag, Trash2 } from "lucide-react";
import { createCoupon, toggleCouponActive, deleteCoupon } from "@/app/admin/settings/actions";
import { formatPrice, formatDate } from "@/lib/utils";
import type { Coupon } from "@/types/database";

export function CouponsManager({ coupons }: { coupons: Coupon[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");

  return (
    <div>
      <p className="eyebrow">Coupons</p>

      <div className="mt-4">
        {coupons.length > 0 ? (
          <div className="divide-y divide-ink-300 border border-ink-300">
            {coupons.map((coupon) => (
              <div key={coupon.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-ink-900">{coupon.code}</span>
                    <Badge tone={coupon.is_active ? "success" : "neutral"}>
                      {coupon.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {coupon.discount_type === "percentage"
                      ? `${coupon.discount_value}% off`
                      : `${formatPrice(coupon.discount_value)} off`}
                    {coupon.max_uses !== null && ` · Max uses: ${coupon.max_uses}`}
                    {coupon.expires_at && ` · Expires ${formatDate(coupon.expires_at)}`}
                    {` · Used ${coupon.used_count} times`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    loading={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        await toggleCouponActive(coupon.id, !coupon.is_active);
                        router.refresh();
                      })
                    }
                  >
                    {coupon.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <button
                    onClick={() =>
                      startTransition(async () => {
                        await deleteCoupon(coupon.id);
                        router.refresh();
                      })
                    }
                    className="rounded p-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Tag} title="No coupons yet" className="py-8" />
        )}
      </div>

      <form
        action={(formData) =>
          startTransition(async () => {
            setError(null);
            try {
              await createCoupon(formData);
              router.refresh();
              (document.getElementById("coupon-form") as HTMLFormElement)?.reset();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not create coupon.");
            }
          })
        }
        id="coupon-form"
        className="mt-5 grid gap-3 border border-dashed border-ink-300 p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div>
          <Label htmlFor="code">Code</Label>
          <Input id="code" name="code" placeholder="WELCOME20" required />
        </div>
        <div>
          <Label htmlFor="discount_type">Discount type</Label>
          <select
            id="discount_type"
            name="discount_type"
            value={discountType}
            onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed")}
            className="h-10 w-full rounded-md border border-ink-300 bg-ink-100 px-3 text-sm text-ink-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
          >
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed amount (₹)</option>
          </select>
        </div>
        <div>
          <Label htmlFor="discount_value">{discountType === "percentage" ? "Percent off" : "Amount off (₹)"}</Label>
          <Input id="discount_value" name="discount_value" type="number" min={1} required />
        </div>
        <div>
          <Label htmlFor="max_uses">Max uses (optional)</Label>
          <Input id="max_uses" name="max_uses" type="number" min={1} />
        </div>
        <div>
          <Label htmlFor="expires_at">Expires (optional)</Label>
          <Input id="expires_at" name="expires_at" type="date" />
        </div>
        <div className="flex items-end">
          <Button type="submit" loading={isPending}>
            Create coupon
          </Button>
        </div>
        {error && <p className="text-sm text-danger sm:col-span-2 lg:col-span-4">{error}</p>}
      </form>
    </div>
  );
}
