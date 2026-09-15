import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCsv } from "@/lib/shipping/csv";

export class ShopifyCsvImportError extends Error {}

export interface ShopifyCsvImportResult {
  ordersImported: number;
  lineItemsImported: number;
}

function value(row: Record<string, string>, names: string[]): string {
  for (const name of names) if (row[name]?.trim()) return row[name].trim();
  return "";
}

function moneyToMinor(valueText: string): number {
  const amount = Number(valueText.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function orderNumber(reference: string): number | null {
  const matched = reference.replace(/^#/, "").match(/^\d+$/);
  return matched ? Number(matched[0]) : null;
}

export async function ingestShopifyCsv(supabase: SupabaseClient, enrollmentId: string, csvText: string): Promise<ShopifyCsvImportResult> {
  const { headers, rows } = parseCsv(csvText);
  if (!headers.includes("Name") || !headers.includes("Lineitem name") || !headers.includes("Lineitem quantity") || !headers.includes("Lineitem price")) {
    throw new ShopifyCsvImportError("This does not look like a standard Shopify orders CSV. Export Orders from Shopify with line item columns included.");
  }
  if (rows.length === 0) throw new ShopifyCsvImportError("This file has no order rows to import.");

  const grouped = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const name = value(row, ["Name"]);
    if (!name) continue;
    grouped.set(name, [...(grouped.get(name) ?? []), row]);
  }
  if (grouped.size === 0) throw new ShopifyCsvImportError("No Shopify order names were found in this file.");

  const orders = [...grouped.entries()].map(([name, orderRows]) => {
    const first = orderRows[0] ?? {};
    const calculatedTotal = orderRows.reduce((total, row) => total + moneyToMinor(value(row, ["Lineitem price"])) * Math.max(1, Number(value(row, ["Lineitem quantity"])) || 1), 0);
    return {
      enrollment_id: enrollmentId,
      external_order_id: `shopify_csv:${name}`,
      order_number: orderNumber(name),
      created_at_external: value(first, ["Created at"]) || null,
      updated_at_external: value(first, ["Processed at", "Updated at"]) || null,
      financial_status: value(first, ["Financial Status"]) || null,
      fulfillment_status: value(first, ["Fulfillment Status"]) || null,
      currency: value(first, ["Currency"]) || "INR",
      subtotal_price: moneyToMinor(value(first, ["Subtotal"])) || null,
      total_discounts: moneyToMinor(value(first, ["Discount Amount"])) || null,
      total_shipping: moneyToMinor(value(first, ["Shipping"])) || null,
      total_tax: moneyToMinor(value(first, ["Taxes"])) || null,
      total_price: moneyToMinor(value(first, ["Total"])) || calculatedTotal,
      cancelled_at: value(first, ["Cancelled at"]) || null,
      synced_at: new Date().toISOString(),
      source: "shopify_csv",
    };
  });
  const { data: savedOrders, error: orderError } = await supabase
    .from("mentorship_shopify_orders")
    .upsert(orders, { onConflict: "enrollment_id,external_order_id" })
    .select("id, external_order_id");
  if (orderError || !savedOrders) throw new ShopifyCsvImportError("Could not save Shopify orders from this CSV.");
  const orderIdByExternal = new Map(savedOrders.map((order) => [order.external_order_id as string, order.id as string]));

  // CSV orders have no Shopify product API identifiers, so create stable
  // source-labelled product records from their line-item names. This feeds
  // the existing Phase C discovery and mapping flow; it is not a parallel
  // catalog or a replacement for API-imported products.
  const productTitles = Array.from(new Set(rows.map((row) => value(row, ["Lineitem name"])).filter(Boolean)));
  const csvProducts = productTitles.map((title) => ({
    enrollment_id: enrollmentId,
    external_product_id: `shopify_csv:${title.toLowerCase()}`,
    title,
    handle: null,
    status: "active",
    vendor: null,
    product_type: null,
    synced_at: new Date().toISOString(),
    source: "shopify_csv",
  }));
  const { data: savedProducts, error: productError } = csvProducts.length
    ? await supabase.from("mentorship_shopify_products").upsert(csvProducts, { onConflict: "enrollment_id,external_product_id" }).select("id, external_product_id")
    : { data: [], error: null };
  if (productError) throw new ShopifyCsvImportError("Could not save Shopify products from this CSV.");
  const productIdByExternal = new Map((savedProducts ?? []).map((product) => [product.external_product_id as string, product.id as string]));

  const lineItems = rows.flatMap((row, index) => {
    const name = value(row, ["Name"]);
    const title = value(row, ["Lineitem name"]);
    const orderId = orderIdByExternal.get(`shopify_csv:${name}`);
    if (!name || !title || !orderId) return [];
    return [{
      enrollment_id: enrollmentId,
      order_id: orderId,
      external_line_item_id: `shopify_csv:${name}:${index}`,
      external_order_id: `shopify_csv:${name}`,
      product_id: productIdByExternal.get(`shopify_csv:${title.toLowerCase()}`) ?? null,
      external_product_id: value(row, ["Lineitem sku"]) || null,
      variant_id: null,
      external_variant_id: value(row, ["Lineitem variant"]) || null,
      title,
      quantity: Math.max(1, Number(value(row, ["Lineitem quantity"])) || 1),
      price: moneyToMinor(value(row, ["Lineitem price"])),
      total_discount: moneyToMinor(value(row, ["Lineitem discount"])),
      synced_at: new Date().toISOString(),
      source: "shopify_csv",
    }];
  });
  if (lineItems.length) {
    const { error: lineItemError } = await supabase
      .from("mentorship_shopify_order_line_items")
      .upsert(lineItems, { onConflict: "enrollment_id,external_line_item_id" });
    if (lineItemError) throw new ShopifyCsvImportError("Could not save Shopify order line items from this CSV.");
  }
  return { ordersImported: orders.length, lineItemsImported: lineItems.length };
}
