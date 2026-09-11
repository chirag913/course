import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { SHOPIFY_API_VERSION, getValidShopifyToken } from "@/lib/connections/shopify";
import { toMinorUnits } from "./money";
import type { MentorshipConnection } from "@/types/database";

const PAGE_LIMIT = 250; // Shopify's max per page
const MAX_PAGES = 200; // safety cap — 50,000 records per resource per sync

// Distinguishes "needs reconnect" from "transient/unexpected" so the caller
// (syncProvider) can produce an honest, specific error message rather than a
// generic failure — see PART K of the Phase B spec.
export class ShopifyIngestError extends Error {
  constructor(
    message: string,
    public readonly kind: "auth" | "rate_limit" | "not_configured" | "api" = "api"
  ) {
    super(message);
  }
}

interface ShopifyFetchResult<T> {
  body: T;
  nextPageInfo: string | null;
}

async function shopifyFetch<T>(shopDomain: string, accessToken: string, path: string, params: Record<string, string>): Promise<ShopifyFetchResult<T>> {
  const url = new URL(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { "X-Shopify-Access-Token": accessToken },
  });

  if (res.status === 401 || res.status === 403) {
    throw new ShopifyIngestError("Shopify rejected the stored access token. Please reconnect Shopify.", "auth");
  }
  if (res.status === 429) {
    throw new ShopifyIngestError("Shopify rate-limited this sync. Please try again shortly.", "rate_limit");
  }
  if (!res.ok) {
    throw new ShopifyIngestError(`Shopify API returned an unexpected error (status ${res.status}).`, "api");
  }

  let body: T;
  try {
    body = (await res.json()) as T;
  } catch {
    throw new ShopifyIngestError("Shopify returned a response that could not be parsed.", "api");
  }

  const link = res.headers.get("Link") ?? res.headers.get("link");
  let nextPageInfo: string | null = null;
  if (link) {
    const match = link.split(",").find((part) => part.includes('rel="next"'));
    if (match) {
      const urlMatch = match.match(/<([^>]+)>/);
      const nextUrl = urlMatch?.[1];
      if (nextUrl) {
        nextPageInfo = new URL(nextUrl).searchParams.get("page_info");
      }
    }
  }
  return { body, nextPageInfo };
}

async function paginate<TItem>(
  shopDomain: string,
  accessToken: string,
  path: string,
  rootKey: string,
  initialParams: Record<string, string>
): Promise<TItem[]> {
  const items: TItem[] = [];
  let pageInfo: string | null = null;
  let page = 0;

  do {
    const params: Record<string, string> = pageInfo
      ? { limit: String(PAGE_LIMIT), page_info: pageInfo }
      : { ...initialParams, limit: String(PAGE_LIMIT) };

    const result: ShopifyFetchResult<Record<string, TItem[]>> = await shopifyFetch(shopDomain, accessToken, path, params);
    items.push(...(result.body[rootKey] ?? []));
    pageInfo = result.nextPageInfo;
    page += 1;
  } while (pageInfo && page < MAX_PAGES);

  return items;
}

interface ShopifyProductVariantJson {
  id: number;
  title: string | null;
  sku: string | null;
  price: string | null;
  compare_at_price: string | null;
  inventory_quantity: number | null;
}

interface ShopifyProductJson {
  id: number;
  title: string;
  handle: string | null;
  status: string | null;
  vendor: string | null;
  product_type: string | null;
  variants?: ShopifyProductVariantJson[];
}

interface ShopifyLineItemJson {
  id: number;
  product_id: number | null;
  variant_id: number | null;
  title: string;
  quantity: number;
  price: string | null;
  total_discount: string | null;
}

interface ShopifyOrderJson {
  id: number;
  order_number: number | null;
  created_at: string | null;
  updated_at: string | null;
  financial_status: string | null;
  fulfillment_status: string | null;
  currency: string;
  subtotal_price: string | null;
  total_discounts: string | null;
  total_shipping_price_set?: { shop_money?: { amount?: string } };
  total_tax: string | null;
  total_price: string;
  cancelled_at: string | null;
  line_items?: ShopifyLineItemJson[];
}

async function upsertProducts(enrollmentId: string, products: ShopifyProductJson[]): Promise<{ products: number; variants: number }> {
  if (products.length === 0) return { products: 0, variants: 0 };
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const productRows = products.map((p) => ({
    enrollment_id: enrollmentId,
    external_product_id: String(p.id),
    title: p.title,
    handle: p.handle,
    status: p.status,
    vendor: p.vendor,
    product_type: p.product_type,
    synced_at: now,
  }));

  const { data: upserted, error } = await admin
    .from("mentorship_shopify_products")
    .upsert(productRows, { onConflict: "enrollment_id,external_product_id" })
    .select("id, external_product_id");
  if (error) throw new ShopifyIngestError("Could not save Shopify products.", "api");

  const productIdByExternal = new Map((upserted ?? []).map((r) => [r.external_product_id, r.id as string]));

  const variantRows = products.flatMap((p) =>
    (p.variants ?? []).map((v) => ({
      enrollment_id: enrollmentId,
      product_id: productIdByExternal.get(String(p.id)) ?? null,
      external_variant_id: String(v.id),
      external_product_id: String(p.id),
      title: v.title,
      sku: v.sku,
      price: toMinorUnits(v.price),
      compare_at_price: toMinorUnits(v.compare_at_price),
      inventory_quantity: v.inventory_quantity,
      synced_at: now,
    }))
  );

  if (variantRows.length > 0) {
    const { error: variantError } = await admin
      .from("mentorship_shopify_product_variants")
      .upsert(variantRows, { onConflict: "enrollment_id,external_variant_id" });
    if (variantError) throw new ShopifyIngestError("Could not save Shopify product variants.", "api");
  }

  return { products: productRows.length, variants: variantRows.length };
}

async function upsertOrders(enrollmentId: string, orders: ShopifyOrderJson[]): Promise<{ orders: number; lineItems: number }> {
  if (orders.length === 0) return { orders: 0, lineItems: 0 };
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const orderRows = orders.map((o) => ({
    enrollment_id: enrollmentId,
    external_order_id: String(o.id),
    order_number: o.order_number,
    created_at_external: o.created_at,
    updated_at_external: o.updated_at,
    financial_status: o.financial_status,
    fulfillment_status: o.fulfillment_status,
    currency: o.currency,
    subtotal_price: toMinorUnits(o.subtotal_price),
    total_discounts: toMinorUnits(o.total_discounts),
    total_shipping: toMinorUnits(o.total_shipping_price_set?.shop_money?.amount ?? null),
    total_tax: toMinorUnits(o.total_tax),
    total_price: toMinorUnits(o.total_price) ?? 0,
    cancelled_at: o.cancelled_at,
    synced_at: now,
  }));

  const { data: upserted, error } = await admin
    .from("mentorship_shopify_orders")
    .upsert(orderRows, { onConflict: "enrollment_id,external_order_id" })
    .select("id, external_order_id");
  if (error) throw new ShopifyIngestError("Could not save Shopify orders.", "api");

  const orderIdByExternal = new Map((upserted ?? []).map((r) => [r.external_order_id, r.id as string]));

  // Resolve line items' product/variant external IDs to our internal IDs in
  // one bulk lookup rather than N+1 queries.
  const externalProductIds = Array.from(
    new Set(orders.flatMap((o) => (o.line_items ?? []).map((li) => li.product_id).filter((id): id is number => id != null)).map(String))
  );
  const externalVariantIds = Array.from(
    new Set(orders.flatMap((o) => (o.line_items ?? []).map((li) => li.variant_id).filter((id): id is number => id != null)).map(String))
  );

  const [{ data: productLookup }, { data: variantLookup }] = await Promise.all([
    externalProductIds.length
      ? admin.from("mentorship_shopify_products").select("id, external_product_id").eq("enrollment_id", enrollmentId).in("external_product_id", externalProductIds)
      : Promise.resolve({ data: [] as { id: string; external_product_id: string }[] }),
    externalVariantIds.length
      ? admin.from("mentorship_shopify_product_variants").select("id, external_variant_id").eq("enrollment_id", enrollmentId).in("external_variant_id", externalVariantIds)
      : Promise.resolve({ data: [] as { id: string; external_variant_id: string }[] }),
  ]);
  const productIdByExternal = new Map((productLookup ?? []).map((r) => [r.external_product_id, r.id]));
  const variantIdByExternal = new Map((variantLookup ?? []).map((r) => [r.external_variant_id, r.id]));

  const lineItemRows = orders.flatMap((o) =>
    (o.line_items ?? []).map((li) => ({
      enrollment_id: enrollmentId,
      order_id: orderIdByExternal.get(String(o.id)) as string,
      external_line_item_id: String(li.id),
      external_order_id: String(o.id),
      product_id: li.product_id != null ? productIdByExternal.get(String(li.product_id)) ?? null : null,
      external_product_id: li.product_id != null ? String(li.product_id) : null,
      variant_id: li.variant_id != null ? variantIdByExternal.get(String(li.variant_id)) ?? null : null,
      external_variant_id: li.variant_id != null ? String(li.variant_id) : null,
      title: li.title,
      quantity: li.quantity,
      price: toMinorUnits(li.price) ?? 0,
      total_discount: toMinorUnits(li.total_discount) ?? 0,
      synced_at: now,
    }))
  );

  if (lineItemRows.length > 0) {
    const { error: lineItemError } = await admin
      .from("mentorship_shopify_order_line_items")
      .upsert(lineItemRows, { onConflict: "enrollment_id,external_line_item_id" });
    if (lineItemError) throw new ShopifyIngestError("Could not save Shopify order line items.", "api");
  }

  return { orders: orderRows.length, lineItems: lineItemRows.length };
}

export interface ShopifyIngestResult {
  recordsProcessed: number;
  productsImported: number;
  variantsImported: number;
  ordersImported: number;
  lineItemsImported: number;
  ordersWindowNote: string;
}

// Shopify's standard `read_orders` scope (no `read_all_orders`) only
// returns orders created in roughly the last 60 days — a real platform
// limitation, not a bug in this code. We're honest about it in the result
// rather than implying full historical import happened.
const ORDERS_WINDOW_NOTE =
  "Shopify's read_orders scope returns orders from roughly the last 60 days only. Older orders require the read_all_orders protected scope, which this app does not request (see PHASE_A_CONNECTIONS.md).";

export async function ingestShopifyForConnection(
  enrollmentId: string,
  connection: Pick<MentorshipConnection, "id" | "external_account_id">,
  options: { since?: string | null } = {}
): Promise<ShopifyIngestResult> {
  const shopDomain = connection.external_account_id;
  if (!shopDomain) throw new ShopifyIngestError("This Shopify connection has no store domain on record. Please reconnect.", "auth");

  const accessToken = await getValidShopifyToken(connection.id, shopDomain);
  if (!accessToken) throw new ShopifyIngestError("Shopify's stored connection is invalid or expired. Please reconnect Shopify.", "auth");

  const productParams: Record<string, string> = {};
  if (options.since) productParams.updated_at_min = options.since;
  const products = await paginate<ShopifyProductJson>(shopDomain, accessToken, "/products.json", "products", productParams);
  const productResult = await upsertProducts(enrollmentId, products);

  const orderParams: Record<string, string> = { status: "any" };
  if (options.since) orderParams.updated_at_min = options.since;
  const orders = await paginate<ShopifyOrderJson>(shopDomain, accessToken, "/orders.json", "orders", orderParams);
  const orderResult = await upsertOrders(enrollmentId, orders);

  return {
    recordsProcessed: productResult.products + productResult.variants + orderResult.orders + orderResult.lineItems,
    productsImported: productResult.products,
    variantsImported: productResult.variants,
    ordersImported: orderResult.orders,
    lineItemsImported: orderResult.lineItems,
    ordersWindowNote: ORDERS_WINDOW_NOTE,
  };
}
