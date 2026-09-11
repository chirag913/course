import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResolvedDateRange } from "./date-range";

export interface UnmappedShopifyProduct {
  id: string;
  title: string;
  handle: string | null;
  vendor: string | null;
}

export async function getUnmappedShopifyProducts(
  supabase: SupabaseClient,
  enrollmentId: string
): Promise<UnmappedShopifyProduct[]> {
  const [{ data: products }, { data: links }] = await Promise.all([
    supabase
      .from("mentorship_shopify_products")
      .select("id, title, handle, vendor")
      .eq("enrollment_id", enrollmentId)
      .order("title"),
    supabase.from("mentorship_product_shopify_links").select("shopify_product_id").eq("enrollment_id", enrollmentId),
  ]);
  const linked = new Set((links ?? []).map((l) => l.shopify_product_id as string));
  return (products ?? []).filter((p) => !linked.has(p.id as string)) as UnmappedShopifyProduct[];
}

export interface UnmappedMetaAd {
  id: string;
  name: string | null;
  adSetName: string | null;
  campaignName: string | null;
  spend: number | null; // minor units, summed over the given range
}

function firstOf<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export async function getUnmappedMetaAds(
  supabase: SupabaseClient,
  enrollmentId: string,
  range: ResolvedDateRange
): Promise<UnmappedMetaAd[]> {
  const [{ data: ads }, { data: links }] = await Promise.all([
    supabase
      .from("mentorship_meta_ads")
      .select("id, name, mentorship_meta_ad_sets(name), mentorship_meta_campaigns(name)")
      .eq("enrollment_id", enrollmentId)
      .order("name"),
    supabase.from("mentorship_product_meta_links").select("meta_ad_id").eq("enrollment_id", enrollmentId),
  ]);

  const linked = new Set((links ?? []).map((l) => l.meta_ad_id as string));
  const unlinkedAds = (ads ?? []).filter((a) => !linked.has(a.id as string));
  if (unlinkedAds.length === 0) return [];

  const adIds = unlinkedAds.map((a) => a.id as string);
  const { data: insights } = await supabase
    .from("mentorship_meta_ad_insights")
    .select("ad_id, spend")
    .eq("enrollment_id", enrollmentId)
    .in("ad_id", adIds)
    .gte("date", range.start)
    .lte("date", range.end);

  const spendByAd = new Map<string, number>();
  for (const row of insights ?? []) {
    const adId = row.ad_id as string;
    spendByAd.set(adId, (spendByAd.get(adId) ?? 0) + ((row.spend as number) ?? 0));
  }

  return unlinkedAds.map((a) => ({
    id: a.id as string,
    name: a.name as string | null,
    adSetName: firstOf(a.mentorship_meta_ad_sets as { name: string | null } | { name: string | null }[] | null)?.name ?? null,
    campaignName:
      firstOf(a.mentorship_meta_campaigns as { name: string | null } | { name: string | null }[] | null)?.name ?? null,
    spend: spendByAd.has(a.id as string) ? (spendByAd.get(a.id as string) as number) : null,
  }));
}
