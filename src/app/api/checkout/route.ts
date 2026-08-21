import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRazorpayClient } from "@/lib/razorpay";
import { applyCoupon, isCouponValid } from "@/lib/pricing";
import type { Coupon, Course } from "@/types/database";

const bodySchema = z.object({
  courseId: z.string().uuid(),
  couponCode: z.string().trim().optional(),
});

// Creates a pending order + a matching Razorpay order. Never grants access —
// that only happens once the webhook verifies a completed payment.
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { courseId, couponCode } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });
  }

  const { data: course } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .eq("status", "published")
    .single<Course>();
  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  const { data: existingEnrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle();
  if (existingEnrollment) {
    return NextResponse.json({ error: "You already have access to this course." }, { status: 400 });
  }

  let coupon: Coupon | null = null;
  if (couponCode) {
    const admin = createAdminClient();
    const { data: found } = await admin
      .from("coupons")
      .select("*")
      .ilike("code", couponCode)
      .maybeSingle<Coupon>();

    if (!found) {
      return NextResponse.json({ error: "Invalid coupon code." }, { status: 400 });
    }
    const validity = isCouponValid(found);
    if (!validity.valid) {
      return NextResponse.json({ error: validity.reason }, { status: 400 });
    }
    coupon = found;
  }

  const { originalAmount, discountAmount, finalAmount } = applyCoupon(course.price, coupon);

  // Razorpay requires a positive amount for a payment order. A 100%-off
  // coupon grants enrollment directly without touching Razorpay at all.
  if (finalAmount <= 0) {
    const admin = createAdminClient();
    const { data: order, error: orderError } = await admin
      .from("orders")
      .insert({
        user_id: user.id,
        course_id: courseId,
        amount: 0,
        status: "paid",
        coupon_id: coupon?.id ?? null,
        discount_amount: discountAmount,
      })
      .select()
      .single();
    if (orderError || !order) {
      return NextResponse.json({ error: "Could not create order." }, { status: 500 });
    }
    await admin.from("order_items").insert({ order_id: order.id, course_id: courseId, price: 0 });
    await admin
      .from("enrollments")
      .upsert({ user_id: user.id, course_id: courseId, order_id: order.id }, { onConflict: "user_id,course_id" });
    if (coupon) {
      await admin.from("coupon_redemptions").insert({ coupon_id: coupon.id, order_id: order.id, user_id: user.id });
      await admin.from("coupons").update({ used_count: coupon.used_count + 1 }).eq("id", coupon.id);
    }
    return NextResponse.json({ free: true });
  }

  const razorpay = getRazorpayClient();
  const razorpayOrder = await razorpay.orders.create({
    amount: finalAmount,
    currency: course.currency,
    receipt: `course_${courseId}_${Date.now()}`,
    notes: { course_id: courseId, user_id: user.id },
  });

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      user_id: user.id,
      course_id: courseId,
      amount: finalAmount,
      currency: course.currency,
      status: "created",
      coupon_id: coupon?.id ?? null,
      discount_amount: discountAmount,
      razorpay_order_id: razorpayOrder.id,
    })
    .select()
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Could not create order." }, { status: 500 });
  }

  return NextResponse.json({
    free: false,
    orderId: order.id,
    razorpayOrderId: razorpayOrder.id,
    amount: finalAmount,
    originalAmount,
    discountAmount,
    currency: course.currency,
    keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    courseName: course.title,
  });
}
