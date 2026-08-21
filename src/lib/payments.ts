import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Single source of truth for turning a verified Razorpay payment into
// database state: order -> paid, enrollment created, coupon redeemed.
// Called from both /api/checkout/verify (fast path, right after checkout.js
// reports success) and /api/webhooks/razorpay (durable path, the payment
// gateway's own server-to-server callback). Both call sites already
// verified an HMAC signature before reaching here. Idempotent — safe to
// call twice for the same order (Razorpay retries webhooks, and the client
// may also race the webhook).
export async function confirmPayment(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) {
  const admin = createAdminClient();

  const { data: order } = await admin
    .from("orders")
    .select("*")
    .eq("razorpay_order_id", params.razorpayOrderId)
    .single();

  if (!order) {
    return { ok: false as const, reason: "order_not_found" as const };
  }

  if (order.status === "paid") {
    return { ok: true as const, alreadyProcessed: true as const, order };
  }

  const { data: updatedOrder, error } = await admin
    .from("orders")
    .update({
      status: "paid",
      razorpay_payment_id: params.razorpayPaymentId,
      razorpay_signature: params.razorpaySignature,
    })
    .eq("id", order.id)
    .eq("status", "created") // guards against a concurrent duplicate update
    .select()
    .single();

  if (error || !updatedOrder) {
    // Lost the race to another concurrent call — treat as already processed.
    return { ok: true as const, alreadyProcessed: true as const, order };
  }

  await admin.from("order_items").insert({
    order_id: order.id,
    course_id: order.course_id,
    price: order.amount,
  });

  await admin
    .from("enrollments")
    .upsert(
      { user_id: order.user_id, course_id: order.course_id, order_id: order.id },
      { onConflict: "user_id,course_id" }
    );

  if (order.coupon_id) {
    await admin.from("coupon_redemptions").insert({
      coupon_id: order.coupon_id,
      order_id: order.id,
      user_id: order.user_id,
    });
    const { data: coupon } = await admin
      .from("coupons")
      .select("used_count")
      .eq("id", order.coupon_id)
      .single();
    if (coupon) {
      await admin
        .from("coupons")
        .update({ used_count: coupon.used_count + 1 })
        .eq("id", order.coupon_id);
    }
  }

  return { ok: true as const, alreadyProcessed: false as const, order: updatedOrder };
}

export async function markPaymentFailed(razorpayOrderId: string) {
  const admin = createAdminClient();
  await admin
    .from("orders")
    .update({ status: "failed" })
    .eq("razorpay_order_id", razorpayOrderId)
    .eq("status", "created");
}

export async function markPaymentRefunded(razorpayPaymentId: string) {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .update({ status: "refunded" })
    .eq("razorpay_payment_id", razorpayPaymentId)
    .select()
    .maybeSingle();

  if (order) {
    await admin
      .from("enrollments")
      .delete()
      .eq("user_id", order.user_id)
      .eq("course_id", order.course_id);
  }
}
