import crypto from "crypto";
import { NextResponse } from "next/server";
import { normalizeShopDomain } from "@/lib/connections/shopify";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function hasValidSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret || !signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const actualBuffer = Buffer.from(signature, "base64");
  const expectedBuffer = Buffer.from(expected, "base64");
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

async function eraseShopifyData(shopDomain: string) {
  const admin = createAdminClient();
  const { data: connections, error } = await admin
    .from("mentorship_connections")
    .select("id, enrollment_id")
    .eq("provider", "shopify")
    .eq("external_account_id", shopDomain);
  if (error) throw error;

  for (const connection of connections ?? []) {
    const enrollmentId = connection.enrollment_id as string;
    // Cascades are limited to Shopify-derived line items and mappings. The
    // enrollment, course, mentorship, Meta, and manually imported shipping
    // data deliberately remain intact.
    const results = await Promise.all([
      admin.from("mentorship_shopify_orders").delete().eq("enrollment_id", enrollmentId),
      admin.from("mentorship_shopify_products").delete().eq("enrollment_id", enrollmentId),
      admin.from("mentorship_data_syncs").delete().eq("enrollment_id", enrollmentId).eq("provider", "shopify"),
      admin.from("mentorship_connections").delete().eq("id", connection.id),
    ]);
    if (results.some(({ error: resultError }) => resultError)) throw new Error("Could not erase Shopify data.");
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!hasValidSignature(rawBody, request.headers.get("x-shopify-hmac-sha256"))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let payload: { shop_domain?: string };
  try {
    payload = JSON.parse(rawBody) as { shop_domain?: string };
  } catch {
    return new NextResponse("Invalid payload", { status: 400 });
  }

  const topic = request.headers.get("x-shopify-topic");
  const shopDomain = payload.shop_domain ? normalizeShopDomain(payload.shop_domain) : null;
  if (!shopDomain) return new NextResponse("Invalid shop domain", { status: 400 });
  if (topic === "shop/redact") await eraseShopifyData(shopDomain);
  if (!["customers/data_request", "customers/redact", "shop/redact"].includes(topic ?? "")) {
    return new NextResponse("Unsupported topic", { status: 400 });
  }

  // No Shopify customer PII is stored, so customer data requests/redactions
  // have no customer record to return or erase.
  return NextResponse.json({ ok: true });
}
