"use client";

import { useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Tag } from "lucide-react";
import { siteConfig } from "@/lib/site-config";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

// The minimal shape any sellable program (course, mentorship, or a future
// type) needs to expose for checkout — deliberately not `Course`, so this
// component doesn't require a `courses` row to exist.
export interface CheckoutProgram {
  id: string;
  slug: string;
  title: string;
  price: number;
  currency: string;
}

const VERIFY_RETRY_DELAYS_MS = [0, 1000, 2000];

// A dropped connection or a momentarily-unavailable server during the verify
// call must not silently strand a payment Razorpay already captured — retry
// a few times with short backoff before falling back to a manual-reconcile
// message. The webhook remains the durable confirmation path; this only
// covers the common transient case so the user isn't stuck for no reason.
async function verifyPaymentWithRetry(response: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<boolean> {
  for (let attempt = 0; attempt < VERIFY_RETRY_DELAYS_MS.length; attempt++) {
    const delay = VERIFY_RETRY_DELAYS_MS[attempt] ?? 0;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    try {
      const verifyRes = await fetch("/api/checkout/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(response),
      });
      if (verifyRes.ok) return true;
    } catch {
      // Network/connection failure — fall through and retry.
    }
  }
  return false;
}

export function CheckoutBox({
  program,
  isSignedIn,
  isEnrolled,
  salesPath = "/courses",
}: {
  program: CheckoutProgram;
  isSignedIn: boolean;
  isEnrolled: boolean;
  salesPath?: string;
}) {
  const router = useRouter();
  const [couponCode, setCouponCode] = useState("");
  const [showCoupon, setShowCoupon] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gatewayReady, setGatewayReady] = useState(
    () => typeof window !== "undefined" && typeof window.Razorpay === "function"
  );

  async function startCheckout() {
    setError(null);
    setLoading(true);
    if (typeof window === "undefined" || typeof window.Razorpay !== "function") {
      setError("Payment gateway is not ready yet. Please try again in a moment.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId: program.id,
          couponCode: couponCode || undefined,
        }),
      });
      const bodyText = await res.text();
      let parsed: unknown = null;
      try {
        parsed = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        parsed = null;
      }
      const data = parsed && typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : { error: bodyText };

      if (!res.ok) {
        setError((data.error && typeof data.error === "string" ? data.error : "Something went wrong.") as string);
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
          const verified = await verifyPaymentWithRetry(response);
          if (verified) {
            router.push("/dashboard?purchased=1");
            router.refresh();
          } else {
            setError(
              `Payment received but verification failed. Contact support with your payment ID: ${response.razorpay_payment_id}`
            );
            setLoading(false);
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
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
        onError={() => setError("Could not load payment gateway. Please refresh and try again.")}
        onLoad={() => setGatewayReady(true)}
      />

      <div className="font-display text-3xl font-bold text-ink-900">
        {formatPrice(program.price, program.currency)}
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
          <Button
            className="mt-4 w-full"
            size="lg"
            onClick={startCheckout}
            disabled={loading || !gatewayReady}
            loading={loading || (!gatewayReady && isSignedIn)}
          >
            {loading ? "Processing..." : !gatewayReady ? "Preparing checkout..." : "Get Instant Access"}
          </Button>
          {!gatewayReady ? <p className="mt-2 text-xs text-ink-500">Loading payment gateway...</p> : null}

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
            onClick={() => router.push(`/signup?next=${salesPath}/${program.slug}`)}
          >
            Sign up to get instant access
          </Button>
          <p className="mt-2 text-center text-xs text-ink-500">
            Already have an account?{" "}
            <button
              className="text-brand-300 hover:underline"
              onClick={() => router.push(`/login?next=${salesPath}/${program.slug}`)}
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
