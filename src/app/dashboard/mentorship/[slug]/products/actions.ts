"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { slugify } from "@/lib/utils";
import { discoverProductsFromShopify } from "@/lib/products/discovery";

// Mirrors the identical helper in connections/actions.ts — re-derives
// ownership from the enrollment row via the RLS-scoped client rather than
// trusting the enrollmentId argument alone. A forged/foreign enrollmentId
// simply resolves to nothing (works for admins too, since is_admin()
// bypasses the ownership check baked into the enrollments SELECT policy).
async function requireOwnEnrollment(enrollmentId: string) {
  await requireUser();
  const supabase = await createClient();
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, programs(slug)")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!enrollment) throw new Error("Mentorship access not found.");
  const slugValue = enrollment.programs as unknown as { slug: string } | { slug: string }[] | null;
  const slug = Array.isArray(slugValue) ? slugValue[0]?.slug : slugValue?.slug;
  if (!slug) throw new Error("Mentorship program not found.");
  return { slug };
}

function revalidateProducts(slug: string, productId?: string) {
  revalidatePath(`/dashboard/mentorship/${slug}/products`);
  if (productId) revalidatePath(`/dashboard/mentorship/${slug}/products/${productId}`);
}

export async function createProduct(enrollmentId: string, name: string) {
  const { slug } = await requireOwnEnrollment(enrollmentId);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Product name is required.");

  const supabase = await createClient();
  const { data: existingSlugs } = await supabase
    .from("mentorship_product_catalog")
    .select("slug")
    .eq("enrollment_id", enrollmentId);
  const taken = new Set((existingSlugs ?? []).map((r) => r.slug as string));
  let productSlug = slugify(trimmed) || "product";
  let n = 2;
  while (taken.has(productSlug)) {
    productSlug = `${slugify(trimmed) || "product"}-${n}`;
    n += 1;
  }

  const { error } = await supabase.from("mentorship_product_catalog").insert({
    enrollment_id: enrollmentId,
    name: trimmed,
    slug: productSlug,
    status: "active",
    source: "manual",
  });
  if (error) {
    throw new Error(error.code === "23505" ? "A product with this name already exists." : "Could not create the product.");
  }
  revalidateProducts(slug);
}

export async function updateProductName(enrollmentId: string, productId: string, name: string) {
  const { slug } = await requireOwnEnrollment(enrollmentId);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Product name is required.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("mentorship_product_catalog")
    .update({ name: trimmed })
    .eq("id", productId)
    .eq("enrollment_id", enrollmentId);
  if (error) {
    throw new Error(error.code === "23505" ? "A product with this name already exists." : "Could not update the product.");
  }
  revalidateProducts(slug, productId);
}

export async function setProductStatus(enrollmentId: string, productId: string, status: "active" | "archived") {
  const { slug } = await requireOwnEnrollment(enrollmentId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("mentorship_product_catalog")
    .update({ status })
    .eq("id", productId)
    .eq("enrollment_id", enrollmentId);
  if (error) throw new Error("Could not update the product's status.");
  revalidateProducts(slug, productId);
}

// Manual mapping. `shopifyVariantId` null means "the whole Shopify product
// (all variants)"; set means "this specific variant only." Both the
// catalog product and the Shopify product/variant are re-checked here
// against the caller's own enrollment before insert (a friendly error
// instead of a raw constraint violation) — the database trigger from
// 0008_mentorship_product_intelligence.sql is the actual enforcement
// backstop, this is just a better error message.
export async function mapShopifyProduct(
  enrollmentId: string,
  productCatalogId: string,
  shopifyProductId: string,
  shopifyVariantId: string | null
) {
  const { slug } = await requireOwnEnrollment(enrollmentId);
  const supabase = await createClient();

  const { data: product } = await supabase
    .from("mentorship_shopify_products")
    .select("id")
    .eq("id", shopifyProductId)
    .eq("enrollment_id", enrollmentId)
    .maybeSingle();
  if (!product) throw new Error("That Shopify product could not be found.");

  if (shopifyVariantId) {
    const { data: variant } = await supabase
      .from("mentorship_shopify_product_variants")
      .select("id, product_id")
      .eq("id", shopifyVariantId)
      .eq("enrollment_id", enrollmentId)
      .maybeSingle();
    if (!variant || variant.product_id !== shopifyProductId) {
      throw new Error("That Shopify variant could not be found under the selected product.");
    }
  }

  const { error } = await supabase.from("mentorship_product_shopify_links").insert({
    enrollment_id: enrollmentId,
    product_catalog_id: productCatalogId,
    shopify_product_id: shopifyProductId,
    shopify_variant_id: shopifyVariantId,
    match_method: "manual",
    confidence: "high",
  });
  if (error) {
    throw new Error(
      error.code === "23505"
        ? "This Shopify product or variant is already mapped to a product."
        : "Could not save the mapping."
    );
  }
  revalidateProducts(slug, productCatalogId);
}

export async function removeShopifyMapping(enrollmentId: string, linkId: string, productCatalogId: string) {
  const { slug } = await requireOwnEnrollment(enrollmentId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("mentorship_product_shopify_links")
    .delete()
    .eq("id", linkId)
    .eq("enrollment_id", enrollmentId);
  if (error) throw new Error("Could not remove the mapping.");
  revalidateProducts(slug, productCatalogId);
}

export async function mapMetaAd(enrollmentId: string, productCatalogId: string, metaAdId: string) {
  const { slug } = await requireOwnEnrollment(enrollmentId);
  const supabase = await createClient();

  const { data: ad } = await supabase
    .from("mentorship_meta_ads")
    .select("id")
    .eq("id", metaAdId)
    .eq("enrollment_id", enrollmentId)
    .maybeSingle();
  if (!ad) throw new Error("That Meta ad could not be found.");

  const { error } = await supabase.from("mentorship_product_meta_links").insert({
    enrollment_id: enrollmentId,
    product_catalog_id: productCatalogId,
    meta_ad_id: metaAdId,
    match_method: "manual",
    confidence: "high",
  });
  if (error) {
    throw new Error(error.code === "23505" ? "This ad is already mapped to a product." : "Could not save the mapping.");
  }
  revalidateProducts(slug, productCatalogId);
}

export async function removeMetaMapping(enrollmentId: string, linkId: string, productCatalogId: string) {
  const { slug } = await requireOwnEnrollment(enrollmentId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("mentorship_product_meta_links")
    .delete()
    .eq("id", linkId)
    .eq("enrollment_id", enrollmentId);
  if (error) throw new Error("Could not remove the mapping.");
  revalidateProducts(slug, productCatalogId);
}

export async function discoverShopifyProducts(enrollmentId: string) {
  const { slug } = await requireOwnEnrollment(enrollmentId);
  const supabase = await createClient();
  const result = await discoverProductsFromShopify(supabase, enrollmentId);
  revalidateProducts(slug);
  return result;
}

export interface SaveEconomicsInput {
  sellingPriceMinor: number | null;
  sellingPriceSource: "shopify" | "manual" | null;
  cogsMinor: number | null;
  shippingCostMinor: number | null;
  codFeeMinor: number | null;
  packagingCostMinor: number | null;
  otherVariableCostMinor: number | null;
  rtoCostMinor: number | null;
}

// Every field is nullable and stays null if the student leaves it blank —
// never coerced to 0. Negative values are rejected here (defense in depth;
// the DB CHECK constraint is the real backstop).
export async function saveProductEconomics(enrollmentId: string, productCatalogId: string, input: SaveEconomicsInput) {
  const { slug } = await requireOwnEnrollment(enrollmentId);

  for (const [label, value] of Object.entries(input)) {
    if (typeof value === "number" && value < 0) {
      throw new Error(`${label} cannot be negative.`);
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("mentorship_product_economics").upsert(
    {
      enrollment_id: enrollmentId,
      product_catalog_id: productCatalogId,
      selling_price_minor: input.sellingPriceMinor,
      selling_price_source: input.sellingPriceSource,
      cogs_minor: input.cogsMinor,
      shipping_cost_minor: input.shippingCostMinor,
      cod_fee_minor: input.codFeeMinor,
      packaging_cost_minor: input.packagingCostMinor,
      other_variable_cost_minor: input.otherVariableCostMinor,
      rto_cost_minor: input.rtoCostMinor,
    },
    { onConflict: "enrollment_id,product_catalog_id" }
  );
  if (error) throw new Error("Could not save economics. Please check the values and try again.");
  revalidateProducts(slug, productCatalogId);
}
