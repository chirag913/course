"use client";

import { useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Tag } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import type { Course } from "@/types/database";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export function CheckoutBox({
  course,
  isSignedIn,
  isEnrolled,
}: {
  course: Course;
  isSignedIn: boolean;
  isEnrolled: boolean;
}) {
  const router = useRouter();
  const [couponCode, setCouponCode] = useState("");
  const [showCoupon, setShowCoupon] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: course.id, couponCode: couponCode || undefined }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setLoading(false);
        return;
      }

      if (data.free) {
        router.push("/dashboard?purchased=1");
        router.refresh();
        return;
      }

      const razorpay = new window.Razorpay({
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: siteConfig.platformName,
        description: data.courseName,
        order_id: data.razorpayOrderId,
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          const verifyRes = await fetch("/api/checkout/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response),
          });
          if (verifyRes.ok) {
            router.push("/dashboard?purchased=1");
            router.refresh();
          } else {
            setError("Payment received but verification failed. Contact support with your payment ID.");
          }
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
        theme: { color: "#d3a43b" },
      });
      razorpay.open();
    } catch {
      setError("Payment wasn't completed. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="border border-ink-300 bg-ink-100 p-6">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <div className="font-display text-3xl font-bold text-ink-900">
        {formatPrice(course.price, course.currency)}
      </div>

      {isEnrolled ? (
        <>
          <p className="mt-3 flex items-center gap-1.5 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" /> You own this course
          </p>
          <Button className="mt-4 w-full" size="lg" onClick={() => router.push("/dashboard")}>
            Go to course
          </Button>
        </>
      ) : isSignedIn ? (
        <>
          <Button className="mt-4 w-full" size="lg" onClick={startCheckout} loading={loading}>
            Get Instant Access
          </Button>

          {showCoupon ? (
            <div className="mt-3 flex gap-2">
              <Input
                placeholder="Coupon code"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                className="h-9"
              />
            </div>
          ) : (
            <button
              onClick={() => setShowCoupon(true)}
              className="mt-3 flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-900"
            >
              <Tag className="h-3 w-3" /> Have a coupon?
            </button>
          )}

          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        </>
      ) : (
        <>
          <Button
            className="mt-4 w-full"
            size="lg"
            onClick={() => router.push(`/signup?next=/courses/${course.slug}`)}
          >
            Sign up to get instant access
          </Button>
          <p className="mt-2 text-center text-xs text-ink-500">
            Already have an account?{" "}
            <button
              className="text-brand-300 hover:underline"
              onClick={() => router.push(`/login?next=/courses/${course.slug}`)}
            >
              Log in
            </button>
          </p>
        </>
      )}

      {!isEnrolled && (
        <p className="mt-4 border-t border-ink-300 pt-4 text-center text-xs text-ink-500">
          <a href="/refund-policy" className="hover:text-ink-900 hover:underline">
            Refund Policy
          </a>
          {" · "}
          <a href="/terms" className="hover:text-ink-900 hover:underline">
            Terms
          </a>
          {" · "}
          <a href="/privacy" className="hover:text-ink-900 hover:underline">
            Privacy
          </a>
        </p>
      )}
    </div>
  );
}
