import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { confirmPayment, markPaymentFailed, markPaymentRefunded } from "@/lib/payments";

// Razorpay's server-to-server webhook. This is the durable source of truth
// for granting course access — configure it in the Razorpay dashboard
// (Settings > Webhooks) to point at /api/webhooks/razorpay, subscribed to
// payment.captured, payment.failed, and refund.processed.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const event = JSON.parse(rawBody);

  switch (event.event) {
    case "payment.captured": {
      const payment = event.payload.payment.entity;
      await confirmPayment({
        razorpayOrderId: payment.order_id,
        razorpayPaymentId: payment.id,
        // Webhook payloads don't carry the checkout.js signature; store the
        // webhook signature itself as proof of a verified capture.
        razorpaySignature: signature,
      });
      break;
    }
    case "payment.failed": {
      const payment = event.payload.payment.entity;
      await markPaymentFailed(payment.order_id);
      break;
    }
    case "refund.processed": {
      const refund = event.payload.refund.entity;
      await markPaymentRefunded(refund.payment_id);
      break;
    }
    default:
      break;
  }

  // Always 200 on a signature-valid request so Razorpay doesn't endlessly
  // retry events we intentionally ignore.
  return NextResponse.json({ received: true });
}
