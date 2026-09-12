import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResolvedDateRange } from "@/lib/products/date-range";

// The account-wide "which ads are actually running" view the mentor
// dashboard needs — distinct from products/metrics.ts's per-product
// aggregation (which only covers ads already mapped to a catalog product).
// Reuses the exact same insight rows and aggregation approach
// (aggregateMetaMetrics in products/metrics.ts), just grouped by ad
// instead of summed across a product's mapped ads.
export interface MetaAdOverviewRow {
  id: string;
  name: string | null;
  status: string | null;
  campaignName: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  purchases: number;
  purchaseValue: number;
  cpa: number | null;
  roas: number | null;
}

export async function getMetaAdsOverview(
  supabase: SupabaseClient,
  enrollmentId: string,
  range: ResolvedDateRange
): Promise<MetaAdOverviewRow[]> {
  const [{ data: ads }, { data: campaigns }, { data: insights }] = await Promise.all([
    supabase.from("mentorship_meta_ads").select("id, name, status, campaign_id").eq("enrollment_id", enrollmentId),
    supabase.from("mentorship_meta_campaigns").select("id, name").eq("enrollment_id", enrollmentId),
    supabase
      .from("mentorship_meta_ad_insights")
      .select("ad_id, spend, impressions, clicks, purchases, purchase_value")
      .eq("enrollment_id", enrollmentId)
      .gte("date", range.start)
      .lte("date", range.end),
  ]);

  const campaignNameById = new Map((campaigns ?? []).map((c) => [c.id as string, c.name as string | null]));

  const aggByAd = new Map<string, { spend: number; impressions: number; clicks: number; purchases: number; purchaseValue: number }>();
  for (const row of insights ?? []) {
    const adId = row.ad_id as string | null;
    if (!adId) continue;
    const agg = aggByAd.get(adId) ?? { spend: 0, impressions: 0, clicks: 0, purchases: 0, purchaseValue: 0 };
    agg.spend += (row.spend as number) ?? 0;
    agg.impressions += (row.impressions as number) ?? 0;
    agg.clicks += (row.clicks as number) ?? 0;
    agg.purchases += (row.purchases as number) ?? 0;
    agg.purchaseValue += (row.purchase_value as number) ?? 0;
    aggByAd.set(adId, agg);
  }

  return (ads ?? []).map((ad) => {
    const agg = aggByAd.get(ad.id as string) ?? { spend: 0, impressions: 0, clicks: 0, purchases: 0, purchaseValue: 0 };
    return {
      id: ad.id as string,
      name: ad.name as string | null,
      status: ad.status as string | null,
      campaignName: ad.campaign_id ? (campaignNameById.get(ad.campaign_id as string) ?? null) : null,
      spend: agg.spend,
      impressions: agg.impressions,
      clicks: agg.clicks,
      ctr: agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : null,
      cpc: agg.clicks > 0 ? Math.round(agg.spend / agg.clicks) : null,
      purchases: agg.purchases,
      purchaseValue: agg.purchaseValue,
      cpa: agg.purchases > 0 ? Math.round(agg.spend / agg.purchases) : null,
      roas: agg.spend > 0 ? agg.purchaseValue / agg.spend : null,
    };
  });
}
