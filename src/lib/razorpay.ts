import "server-only";
import Razorpay from "razorpay";
import crypto from "crypto";

function normalizeEnv(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// Server-only Razorpay client. RAZORPAY_KEY_SECRET must never reach the
// browser bundle — the `server-only` import enforces that at build time.
export function getRazorpayClient() {
  const keyId = normalizeEnv(process.env.RAZORPAY_KEY_ID)
    ?? normalizeEnv(process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID)
    ?? normalizeEnv(process.env.RAZORPAY_KEY)
    ?? normalizeEnv(process.env.NEXT_PUBLIC_RAZORPAY_KEY);
  const keySecret = normalizeEnv(process.env.RAZORPAY_KEY_SECRET) ?? normalizeEnv(process.env.NEXT_PUBLIC_RAZORPAY_KEY_SECRET);
  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials are not configured.");
  }
  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

// Verifies the checkout.js success payload (razorpay_order_id +
// razorpay_payment_id + razorpay_signature) using HMAC-SHA256. This is a
// fast optimistic check only — the webhook remains the source of truth for
// granting enrollment, since this client-reported payload can be spoofed or
// dropped by a flaky connection.
export function verifyPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  if (!normalizeEnv(process.env.RAZORPAY_KEY_SECRET) && !normalizeEnv(process.env.NEXT_PUBLIC_RAZORPAY_KEY_SECRET)) return false;
  const expected = crypto
    .createHmac(
      "sha256",
      normalizeEnv(process.env.RAZORPAY_KEY_SECRET) ?? normalizeEnv(process.env.NEXT_PUBLIC_RAZORPAY_KEY_SECRET) ?? ""
    )
    .update(`${params.orderId}|${params.paymentId}`)
    .digest("hex");
  return timingSafeEqual(expected, params.signature);
}

// Verifies the `X-Razorpay-Signature` header on incoming webhooks against
// the raw request body, using the separate webhook secret configured in the
// Razorpay dashboard.
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) return false;
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
