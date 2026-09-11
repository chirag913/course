import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/utils";
import { bestCatalogMatchForShopifyProduct } from "./matching";
import type { ProductMatchConfidence } from "@/types/database";

export interface DiscoverySuggestion {
  shopifyProductId: string;
  shopifyTitle: string;
  catalogProductId: string;
  catalogName: string;
  confidence: ProductMatchConfidence;
}

export interface DiscoveryResult {
  createdCount: number; // new catalog products auto-created from an unmatched Shopify product
  autoLinkedCount: number; // existing catalog products auto-linked (exact-name match only)
  suggestions: DiscoverySuggestion[]; // medium/low matches — never auto-applied, shown for manual confirmation
}

function uniqueSlug(name: string, taken: Set<string>): string {
  const base = slugify(name) || "product";
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  taken.add(candidate);
  return candidate;
}

// Runs after a Shopify sync (triggered explicitly by the student/admin, not
// automatically — see PHASE_C_PRODUCT_INTELLIGENCE.md). For every Shopify
// product not yet linked to any catalog product:
//   - exact normalized-name match against an existing catalog product ->
//     auto-link (high confidence, safe because it's an exact match)
//   - no match at all -> create a NEW catalog product from it and link it
//     (source='shopify') — safe because there's nothing to confuse it with
//   - medium/low match -> never auto-applied; returned as a suggestion for
//     the student to confirm or reject manually
export async function discoverProductsFromShopify(supabase: SupabaseClient, enrollmentId: string): Promise<DiscoveryResult> {
  const { data: shopifyProducts } = await supabase
    .from("mentorship_shopify_products")
    .select("id, title")
    .eq("enrollment_id", enrollmentId);

  const { data: existingLinks } = await supabase
    .from("mentorship_product_shopify_links")
    .select("shopify_product_id")
    .eq("enrollment_id", enrollmentId);
  const linkedProductIds = new Set((existingLinks ?? []).map((l) => l.shopify_product_id as string));

  const unlinked = (shopifyProducts ?? []).filter((p) => !linkedProductIds.has(p.id as string));
  if (unlinked.length === 0) return { createdCount: 0, autoLinkedCount: 0, suggestions: [] };

  const { data: catalogRows } = await supabase
    .from("mentorship_product_catalog")
    .select("id, name, slug")
    .eq("enrollment_id", enrollmentId)
    .eq("status", "active");

  const catalogProducts = (catalogRows ?? []).map((c) => ({ id: c.id as string, name: c.name as string }));
  const takenSlugs = new Set((catalogRows ?? []).map((c) => c.slug as string));

  let createdCount = 0;
  let autoLinkedCount = 0;
  const suggestions: DiscoverySuggestion[] = [];

  for (const shopifyProduct of unlinked) {
    const title = shopifyProduct.title as string;
    const match = bestCatalogMatchForShopifyProduct(title, catalogProducts);

    if (match?.confidence === "high") {
      const { error } = await supabase.from("mentorship_product_shopify_links").insert({
        enrollment_id: enrollmentId,
        product_catalog_id: match.catalogProductId,
        shopify_product_id: shopifyProduct.id,
        shopify_variant_id: null,
        match_method: "automatic",
        confidence: "high",
      });
      if (!error) autoLinkedCount += 1;
      continue;
    }

    if (match) {
      // medium or low — surface as a suggestion, never auto-apply
      const catalogName = catalogProducts.find((c) => c.id === match.catalogProductId)?.name ?? "";
      suggestions.push({
        shopifyProductId: shopifyProduct.id as string,
        shopifyTitle: title,
        catalogProductId: match.catalogProductId,
        catalogName,
        confidence: match.confidence,
      });
      continue;
    }

    // No match at all — nothing to confuse it with, so it's safe to create
    // a fresh catalog product from it.
    const slug = uniqueSlug(title, takenSlugs);
    const { data: newProduct, error: createError } = await supabase
      .from("mentorship_product_catalog")
      .insert({ enrollment_id: enrollmentId, name: title, slug, status: "active", source: "shopify" })
      .select("id, name")
      .single();
    if (createError || !newProduct) continue;

    const { error: linkError } = await supabase.from("mentorship_product_shopify_links").insert({
      enrollment_id: enrollmentId,
      product_catalog_id: newProduct.id,
      shopify_product_id: shopifyProduct.id,
      shopify_variant_id: null,
      match_method: "automatic",
      confidence: "high",
    });
    if (!linkError) {
      createdCount += 1;
      // Make this newly created product a match candidate for the REST of
      // this same discovery run, so two near-duplicate unlinked Shopify
      // products processed in the same pass (e.g. differently-worded
      // listings for what normalizes to the same product) reuse it instead
      // of each creating their own.
      catalogProducts.push({ id: newProduct.id as string, name: newProduct.name as string });
    }
  }

  return { createdCount, autoLinkedCount, suggestions };
}
