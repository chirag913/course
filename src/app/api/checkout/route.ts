import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRazorpayClient } from "@/lib/razorpay";
import { applyCoupon, isCouponValid } from "@/lib/pricing";
import type { Coupon, Course, Program } from "@/types/database";

function resolveServerRazorpayKeyId(): string | undefined {
  return (
    process.env.RAZORPAY_KEY_ID ??
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ??
    process.env.RAZORPAY_KEY ??
    process.env.NEXT_PUBLIC_RAZORPAY_KEY
  );
}

const bodySchema = z.object({
  programId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  couponCode: z.string().trim().optional(),
}).superRefine((data, ctx) => {
  if (!data.programId && !data.courseId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["programId"],
      message: "programId is required for checkout.",
    });
  }
  if (data.programId && data.courseId && data.programId !== data.courseId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["programId"],
      message: "programId and courseId must match when both are provided.",
    });
  }
});

// Creates a pending order + a matching Razorpay order. Never grants access —
// that only happens once the webhook verifies a completed payment.
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { programId, courseId, couponCode } = parsed.data;
  const resolvedProgramId = programId ?? courseId;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });
  }

  const { data: program } = await supabase
    .from("programs")
    .select("id,type_id,status,title,price,currency")
    .eq("id", resolvedProgramId)
    .eq("status", "published")
    .single<Pick<Program, "id" | "type_id" | "status" | "title" | "price" | "currency">>();
  if (!program) {
    return NextResponse.json({ error: "Program not found." }, { status: 404 });
  }

  const isCourseProgram = program.type_id === "course";
  const isMentorshipProgram = program.type_id === "mentorship";
  if (!isCourseProgram && !isMentorshipProgram) {
    return NextResponse.json({ error: "Unsupported program type." }, { status: 400 });
  }

  if (isCourseProgram) {
    const { data: course } = await supabase
      .from("courses")
      .select("*")
      .eq("id", program.id)
      .eq("status", "published")
      .single<Course>();

    if (!course) {
      return NextResponse.json({ error: "Course not found." }, { status: 404 });
    }
  }

  const { data: existingEnrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", user.id)
    .eq("program_id", program.id)
    .maybeSingle();
  if (existingEnrollment) {
    const message = isCourseProgram ? "You already have access to this course." : "You already have access to this mentorship program.";
    return NextResponse.json({ error: message }, { status: 400 });
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

  const { originalAmount, discountAmount, finalAmount } = applyCoupon(program.price, coupon);

  const courseIdForWrite = isCourseProgram ? program.id : null;
  const razorpayKeyId = resolveServerRazorpayKeyId();

  // Razorpay requires a positive amount for a payment order. A 100%-off
  // coupon grants enrollment directly without touching Razorpay at all.
  if (finalAmount <= 0) {
    const admin = createAdminClient();
    const { data: order, error: orderError } = await admin
      .from("orders")
      .insert({
        user_id: user.id,
        program_id: program.id,
        course_id: courseIdForWrite,
        amount: 0,
        currency: program.currency,
        status: "paid",
        coupon_id: coupon?.id ?? null,
        discount_amount: discountAmount,
      })
      .select()
      .single();
    if (orderError || !order) {
      return NextResponse.json({ error: "Could not create order." }, { status: 500 });
    }
    await admin
      .from("order_items")
      .insert({ order_id: order.id, program_id: program.id, course_id: courseIdForWrite, price: 0 });
    await admin
      .from("enrollments")
      .upsert(
        {
          user_id: user.id,
          program_id: program.id,
          course_id: courseIdForWrite,
          order_id: order.id,
        },
        { onConflict: "user_id,program_id" }
      );
    if (coupon) {
      await admin.from("coupon_redemptions").insert({ coupon_id: coupon.id, order_id: order.id, user_id: user.id });
      await admin.from("coupons").update({ used_count: coupon.used_count + 1 }).eq("id", coupon.id);
    }
    return NextResponse.json({ free: true });
  }

  let razorpayOrder: { id: string };
  try {
    const razorpay = getRazorpayClient();
    razorpayOrder = await razorpay.orders.create({
      amount: finalAmount,
      currency: program.currency,
      // Razorpay caps receipt at 56 chars — user/program context is already
      // captured in `notes` below, so this just needs to be unique.
      receipt: `rcpt_${Date.now()}`,
      notes: {
        program_id: program.id,
        ...(courseIdForWrite ? { course_id: courseIdForWrite } : {}),
        user_id: user.id,
      },
      // Without this, a successful card payment sits in "authorized" status
      // until the account's dashboard-level capture settings (or a manual
      // capture call) promote it to "captured" — and neither our fast-path
      // verify nor the webhook fire for "authorized". Forcing capture here
      // makes checkout behave the same regardless of account defaults.
      payment_capture: true,
    });
  } catch {
    return NextResponse.json({ error: "Payment provider is not configured. Please contact support." }, { status: 503 });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      user_id: user.id,
      program_id: program.id,
      course_id: courseIdForWrite,
      amount: finalAmount,
      currency: program.currency,
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
    currency: program.currency,
    keyId: razorpayKeyId,
    courseName: program.title,
  });
}
