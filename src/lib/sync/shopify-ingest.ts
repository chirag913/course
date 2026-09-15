import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { SHOPIFY_API_VERSION, getValidShopifyToken } from "@/lib/connections/shopify";
import { toMinorUnits } from "./money";
import type { MentorshipConnection } from "@/types/database";

const PAGE_LIMIT = 250;
const MAX_PAGES = 200;

export class ShopifyIngestError extends Error {
  constructor(message: string, public readonly kind: "auth" | "rate_limit" | "not_configured" | "api" = "api") {
    super(message);
  }
}

type Money = { shopMoney: { amount: string } } | null;
type Product = { id: string; title: string; handle: string | null; status: string | null; vendor: string | null; productType: string | null; variants: { nodes: Variant[] } };
type Variant = { id: string; title: string | null; sku: string | null; price: string | null; compareAtPrice: string | null; inventoryQuantity: number | null };
type LineItem = { id: string; product: { id: string } | null; variant: { id: string } | null; title: string; quantity: number; originalUnitPriceSet: Money; totalDiscountSet: Money };
type Order = { id: string; legacyResourceId: string | null; createdAt: string | null; updatedAt: string | null; displayFinancialStatus: string | null; displayFulfillmentStatus: string | null; currencyCode: string; subtotalPriceSet: Money; totalDiscountsSet: Money; totalShippingPriceSet: Money; totalTaxSet: Money; totalPriceSet: Money; cancelledAt: string | null; lineItems: { nodes: LineItem[] } };
type PageInfo = { hasNextPage: boolean; endCursor: string | null };
type PaginatedResponse<T> = { nodes: T[]; pageInfo: PageInfo };

async function graphql<T>(shopDomain: string, token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  if (response.status === 401 || response.status === 403) throw new ShopifyIngestError("Shopify rejected the stored access token. Please reconnect Shopify.", "auth");
  if (response.status === 429) throw new ShopifyIngestError("Shopify rate-limited this sync. Please try again shortly.", "rate_limit");
  if (!response.ok) throw new ShopifyIngestError(`Shopify API returned an unexpected error (status ${response.status}).`, "api");
  const body = (await response.json()) as { data?: T; errors?: { message?: string }[] };
  if (!body.data || body.errors?.length) throw new ShopifyIngestError(body.errors?.[0]?.message || "Shopify returned an incomplete response.", "api");
  return body.data;
}

const PRODUCTS_QUERY = `query Products($first: Int!, $after: String, $query: String) { products(first: $first, after: $after, query: $query) { nodes { id title handle status vendor productType variants(first: 250) { nodes { id title sku price compareAtPrice inventoryQuantity } } } pageInfo { hasNextPage endCursor } } }`;
const ORDERS_QUERY = `query Orders($first: Int!, $after: String, $query: String) { orders(first: $first, after: $after, query: $query) { nodes { id legacyResourceId createdAt updatedAt displayFinancialStatus displayFulfillmentStatus currencyCode cancelledAt subtotalPriceSet { shopMoney { amount } } totalDiscountsSet { shopMoney { amount } } totalShippingPriceSet { shopMoney { amount } } totalTaxSet { shopMoney { amount } } totalPriceSet { shopMoney { amount } } lineItems(first: 250) { nodes { id title quantity product { id } variant { id } originalUnitPriceSet { shopMoney { amount } } totalDiscountSet { shopMoney { amount } } } } } pageInfo { hasNextPage endCursor } } }`;

async function allPages<T>(shopDomain: string, token: string, query: string, root: "products" | "orders", filter: string | null): Promise<T[]> {
  const records: T[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data: Partial<Record<"products" | "orders", PaginatedResponse<T>>> = await graphql<Partial<Record<"products" | "orders", PaginatedResponse<T>>>>(shopDomain, token, query, { first: PAGE_LIMIT, after, query: filter });
    const result = data[root];
    if (!result) throw new ShopifyIngestError("Shopify returned an incomplete paginated response.", "api");
    records.push(...result.nodes);
    if (!result.pageInfo.hasNextPage || !result.pageInfo.endCursor) break;
    after = result.pageInfo.endCursor;
  }
  return records;
}

async function upsertProducts(enrollmentId: string, products: Product[]) {
  if (!products.length) return { products: 0, variants: 0 };
  const admin = createAdminClient();
  const syncedAt = new Date().toISOString();
  const { data, error } = await admin.from("mentorship_shopify_products").upsert(products.map((product) => ({ enrollment_id: enrollmentId, external_product_id: product.id, title: product.title, handle: product.handle, status: product.status, vendor: product.vendor, product_type: product.productType, synced_at: syncedAt })), { onConflict: "enrollment_id,external_product_id" }).select("id, external_product_id");
  if (error) throw new ShopifyIngestError("Could not save Shopify products.", "api");
  const ids = new Map((data ?? []).map((row) => [row.external_product_id, row.id as string]));
  const variants = products.flatMap((product) => product.variants.nodes.map((variant) => ({ enrollment_id: enrollmentId, product_id: ids.get(product.id) ?? null, external_variant_id: variant.id, external_product_id: product.id, title: variant.title, sku: variant.sku, price: toMinorUnits(variant.price), compare_at_price: toMinorUnits(variant.compareAtPrice), inventory_quantity: variant.inventoryQuantity, synced_at: syncedAt })));
  if (variants.length) {
    const { error: variantError } = await admin.from("mentorship_shopify_product_variants").upsert(variants, { onConflict: "enrollment_id,external_variant_id" });
    if (variantError) throw new ShopifyIngestError("Could not save Shopify product variants.", "api");
  }
  return { products: products.length, variants: variants.length };
}

async function upsertOrders(enrollmentId: string, orders: Order[]) {
  if (!orders.length) return { orders: 0, lineItems: 0 };
  const admin = createAdminClient();
  const syncedAt = new Date().toISOString();
  const amount = (money: Money | undefined) => toMinorUnits(money?.shopMoney.amount ?? null);
  const { data, error } = await admin.from("mentorship_shopify_orders").upsert(orders.map((order) => ({ enrollment_id: enrollmentId, external_order_id: order.id, order_number: order.legacyResourceId ? Number(order.legacyResourceId) : null, created_at_external: order.createdAt, updated_at_external: order.updatedAt, financial_status: order.displayFinancialStatus, fulfillment_status: order.displayFulfillmentStatus, currency: order.currencyCode, subtotal_price: amount(order.subtotalPriceSet), total_discounts: amount(order.totalDiscountsSet), total_shipping: amount(order.totalShippingPriceSet), total_tax: amount(order.totalTaxSet), total_price: amount(order.totalPriceSet) ?? 0, cancelled_at: order.cancelledAt, synced_at: syncedAt })), { onConflict: "enrollment_id,external_order_id" }).select("id, external_order_id");
  if (error) throw new ShopifyIngestError("Could not save Shopify orders.", "api");
  const orderIds = new Map((data ?? []).map((row) => [row.external_order_id, row.id as string]));
  const externalProducts = Array.from(new Set(orders.flatMap((order) => order.lineItems.nodes.flatMap((item) => item.product ? [item.product.id] : []))));
  const externalVariants = Array.from(new Set(orders.flatMap((order) => order.lineItems.nodes.flatMap((item) => item.variant ? [item.variant.id] : []))));
  const [{ data: products }, { data: variants }] = await Promise.all([
    externalProducts.length ? admin.from("mentorship_shopify_products").select("id, external_product_id").eq("enrollment_id", enrollmentId).in("external_product_id", externalProducts) : Promise.resolve({ data: [] as { id: string; external_product_id: string }[] }),
    externalVariants.length ? admin.from("mentorship_shopify_product_variants").select("id, external_variant_id").eq("enrollment_id", enrollmentId).in("external_variant_id", externalVariants) : Promise.resolve({ data: [] as { id: string; external_variant_id: string }[] }),
  ]);
  const productIds = new Map((products ?? []).map((row) => [row.external_product_id, row.id]));
  const variantIds = new Map((variants ?? []).map((row) => [row.external_variant_id, row.id]));
  const lineItems = orders.flatMap((order) => order.lineItems.nodes.map((item) => ({ enrollment_id: enrollmentId, order_id: orderIds.get(order.id) as string, external_line_item_id: item.id, external_order_id: order.id, product_id: item.product ? productIds.get(item.product.id) ?? null : null, external_product_id: item.product?.id ?? null, variant_id: item.variant ? variantIds.get(item.variant.id) ?? null : null, external_variant_id: item.variant?.id ?? null, title: item.title, quantity: item.quantity, price: amount(item.originalUnitPriceSet) ?? 0, total_discount: amount(item.totalDiscountSet) ?? 0, synced_at: syncedAt })));
  if (lineItems.length) {
    const { error: lineItemError } = await admin.from("mentorship_shopify_order_line_items").upsert(lineItems, { onConflict: "enrollment_id,external_line_item_id" });
    if (lineItemError) throw new ShopifyIngestError("Could not save Shopify order line items.", "api");
  }
  return { orders: orders.length, lineItems: lineItems.length };
}

export interface ShopifyIngestResult { recordsProcessed: number; productsImported: number; variantsImported: number; ordersImported: number; lineItemsImported: number; ordersWindowNote: string; }
const ORDERS_WINDOW_NOTE = "Shopify's read_orders scope returns orders from roughly the last 60 days only. Older orders require the read_all_orders protected scope, which this app does not request.";

export async function ingestShopifyForConnection(enrollmentId: string, connection: Pick<MentorshipConnection, "id" | "external_account_id">, options: { since?: string | null } = {}): Promise<ShopifyIngestResult> {
  const shopDomain = connection.external_account_id;
  if (!shopDomain) throw new ShopifyIngestError("This Shopify connection has no store domain on record. Please reconnect.", "auth");
  const token = await getValidShopifyToken(connection.id, shopDomain);
  if (!token) throw new ShopifyIngestError("Shopify's stored connection is invalid or expired. Please reconnect Shopify.", "auth");
  const updatedFilter = options.since ? `updated_at:>=${options.since}` : null;
  const [products, orders] = await Promise.all([
    allPages<Product>(shopDomain, token, PRODUCTS_QUERY, "products", updatedFilter),
    allPages<Order>(shopDomain, token, ORDERS_QUERY, "orders", ["status:any", updatedFilter].filter(Boolean).join(" ")),
  ]);
  const productResult = await upsertProducts(enrollmentId, products);
  const orderResult = await upsertOrders(enrollmentId, orders);
  return { recordsProcessed: productResult.products + productResult.variants + orderResult.orders + orderResult.lineItems, productsImported: productResult.products, variantsImported: productResult.variants, ordersImported: orderResult.orders, lineItemsImported: orderResult.lineItems, ordersWindowNote: ORDERS_WINDOW_NOTE };
}
