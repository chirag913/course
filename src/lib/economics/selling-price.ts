import type { SupabaseClient } from "@supabase/supabase-js";

export interface ShopifySellingPriceSuggestion {
  priceMinor: number | null;
  ambiguous: boolean;
  reason: string | null;
}

// Derives a single suggested selling price from the product's Shopify
// mapping (Phase C), WITHOUT averaging or guessing across differing
// variant prices — see PHASE_D_ECONOMICS_SHIPPING.md "Selling price."
// This is only ever a suggestion for the UI to pre-fill; nothing here
// writes to mentorship_product_economics.
export async function getShopifySuggestedSellingPrice(
  supabase: SupabaseClient,
  enrollmentId: string,
  productCatalogId: string
): Promise<ShopifySellingPriceSuggestion> {
  const { data: links } = await supabase
    .from("mentorship_product_shopify_links")
    .select("shopify_product_id, shopify_variant_id")
    .eq("enrollment_id", enrollmentId)
    .eq("product_catalog_id", productCatalogId);

  if (!links || links.length === 0) {
    return { priceMinor: null, ambiguous: false, reason: null };
  }

  const productLevelIds = links.filter((l) => !l.shopify_variant_id).map((l) => l.shopify_product_id as string);
  const variantLevelIds = links.filter((l) => l.shopify_variant_id).map((l) => l.shopify_variant_id as string);

  const prices: number[] = [];

  if (variantLevelIds.length > 0) {
    const { data: variants } = await supabase.from("mentorship_shopify_product_variants").select("price").in("id", variantLevelIds);
    for (const v of variants ?? []) if (v.price != null) prices.push(v.price as number);
  }
  if (productLevelIds.length > 0) {
    const { data: variants } = await supabase
      .from("mentorship_shopify_product_variants")
      .select("price")
      .in("product_id", productLevelIds);
    for (const v of variants ?? []) if (v.price != null) prices.push(v.price as number);
  }

  if (prices.length === 0) {
    return { priceMinor: null, ambiguous: false, reason: "No Shopify variant price is available yet." };
  }

  const distinctPrices = new Set(prices);
  if (distinctPrices.size > 1) {
    return {
      priceMinor: null,
      ambiguous: true,
      reason: "This product has multiple different variant prices in Shopify — confirm the selling price manually rather than guessing an average.",
    };
  }

  return { priceMinor: prices[0] ?? null, ambiguous: false, reason: null };
}
