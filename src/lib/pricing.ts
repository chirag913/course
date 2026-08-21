import type { Coupon } from "@/types/database";

export interface PriceBreakdown {
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
}

// Pure function: given a course price (paise) and an optional coupon, compute
// the final chargeable amount. Validity checks (active/expired/usage limit)
// happen separately in the checkout route, where they can be done atomically
// against the database.
export function applyCoupon(coursePrice: number, coupon: Coupon | null): PriceBreakdown {
  if (!coupon) {
    return { originalAmount: coursePrice, discountAmount: 0, finalAmount: coursePrice };
  }

  const discountAmount =
    coupon.discount_type === "percentage"
      ? Math.round((coursePrice * coupon.discount_value) / 100)
      : Math.min(coupon.discount_value, coursePrice);

  const finalAmount = Math.max(0, coursePrice - discountAmount);
  return { originalAmount: coursePrice, discountAmount, finalAmount };
}

export function isCouponValid(coupon: Coupon): { valid: boolean; reason?: string } {
  if (!coupon.is_active) return { valid: false, reason: "This coupon is no longer active." };
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { valid: false, reason: "This coupon has expired." };
  }
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    return { valid: false, reason: "This coupon has reached its usage limit." };
  }
  return { valid: true };
}
