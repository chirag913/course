import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { META_GRAPH_VERSION, getValidMetaToken } from "@/lib/connections/meta";
import { toMinorUnits } from "./money";

const MAX_PAGES = 200;
const PAGE_LIMIT = 200;

// Default historical window for a first-ever Meta sync when no prior
// successful sync exists to compute an incremental start date from. 30 days
// balances "useful enough for early mentorship decisions" against Meta's
// insights API cost/rate limits for a first pull. Callers may pass a larger
// value explicitly (see syncProvider) — this is a default, not a hard cap.
export const DEFAULT_META_INSIGHTS_WINDOW_DAYS = 30;

export class MetaIngestError extends Error {
  constructor(
    message: string,
    public readonly kind: "auth" | "rate_limit" | "permission" | "invalid_account" | "api" = "api"
  ) {
    super(message);
  }
}

interface MetaErrorBody {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
}

function classifyMetaError(body: MetaErrorBody, status: number): MetaIngestError {
  const code = body.error?.code;
  if (code === 190 || status === 401) {
    return new MetaIngestError("Meta rejected the stored access token. Please reconnect Meta Ads.", "auth");
  }
  if (code === 17 || code === 4 || code === 32 || code === 613 || status === 429) {
    return new MetaIngestError("Meta rate-limited this sync. Please try again shortly.", "rate_limit");
  }
  if (code === 200 || code === 10) {
    return new MetaIngestError("This Meta app no longer has permission to read this ad account.", "permission");
  }
  if (code === 100 && body.error?.error_subcode === 33) {
    return new MetaIngestError("The selected Meta ad account could not be found. It may have been removed.", "invalid_account");
  }
  return new MetaIngestError(body.error?.message ? `Meta API error: ${body.error.message}` : "Meta API returned an unexpected error.", "api");
}

async function metaFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new MetaIngestError("Meta returned a response that could not be parsed.", "api");
  }
  if (!res.ok || (body as MetaErrorBody).error) {
    throw classifyMetaError(body as MetaErrorBody, res.status);
  }
  return body as T;
}

interface MetaPagedResponse<T> {
  data: T[];
  paging?: { next?: string };
}

async function paginateMeta<T>(initialUrl: string): Promise<T[]> {
  const items: T[] = [];
  let url: string | undefined = initialUrl;
  let page = 0;

  while (url && page < MAX_PAGES) {
    const body: MetaPagedResponse<T> = await metaFetch<MetaPagedResponse<T>>(url);
    items.push(...(body.data ?? []));
    url = body.paging?.next;
    page += 1;
  }
  return items;
}

interface MetaAdAccountDetails {
  name?: string;
  currency?: string;
  timezone_name?: string;
  account_status?: number;
}

interface MetaCampaignJson {
  id: string;
  name?: string;
  status?: string;
  objective?: string;
  created_time?: string;
  updated_time?: string;
}

interface MetaAdSetJson {
  id: string;
  name?: string;
  status?: string;
  campaign_id?: string;
  created_time?: string;
  updated_time?: string;
}

interface MetaAdJson {
  id: string;
  name?: string;
  status?: string;
  adset_id?: string;
  campaign_id?: string;
  created_time?: string;
  updated_time?: string;
}

interface MetaActionJson {
  action_type: string;
  value: string;
}

interface MetaInsightJson {
  ad_id: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: MetaActionJson[];
  action_values?: MetaActionJson[];
}

const PURCHASE_ACTION_TYPES = ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"];

function extractPurchaseMetrics(insight: MetaInsightJson): { purchases: number | null; purchaseValue: number | null } {
  // Meta omits the `actions`/`action_values` keys entirely when it has
  // nothing to report for that field (vs. an empty array meaning "tracked,
  // zero conversions") — we store NULL only in the former case, per the
  // "store NULL rather than inventing a metric" rule.
  if (insight.actions === undefined && insight.action_values === undefined) {
    return { purchases: null, purchaseValue: null };
  }
  const purchaseAction = (insight.actions ?? []).find((a) => PURCHASE_ACTION_TYPES.includes(a.action_type));
  const purchaseValueAction = (insight.action_values ?? []).find((a) => PURCHASE_ACTION_TYPES.includes(a.action_type));
  return {
    purchases: purchaseAction ? Math.round(Number(purchaseAction.value)) : 0,
    purchaseValue: purchaseValueAction ? toMinorUnits(purchaseValueAction.value) : 0,
  };
}

export interface MetaIngestResult {
  recordsProcessed: number;
  campaignsImported: number;
  adSetsImported: number;
  adsImported: number;
  insightsImported: number;
  windowDays: number;
}

export async function ingestMetaForConnection(
  enrollmentId: string,
  connection: { id: string; external_account_id: string | null },
  options: { windowDays?: number; since?: string | null } = {}
): Promise<MetaIngestResult> {
  const externalAccountId = connection.external_account_id;
  if (!externalAccountId) throw new MetaIngestError("This Meta connection has no ad account on record. Please reconnect.", "invalid_account");

  const accessToken = await getValidMetaToken(connection.id);
  if (!accessToken) throw new MetaIngestError("Meta's stored connection has expired. Please reconnect Meta Ads.", "auth");

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // 1) Ad account details
  const accountDetails = await metaFetch<MetaAdAccountDetails>(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${externalAccountId}?fields=name,currency,timezone_name,account_status&access_token=${accessToken}`
  );
  const { data: accountRow, error: accountError } = await admin
    .from("mentorship_meta_ad_accounts")
    .upsert(
      {
        enrollment_id: enrollmentId,
        external_account_id: externalAccountId,
        name: accountDetails.name ?? null,
        currency: accountDetails.currency ?? null,
        timezone: accountDetails.timezone_name ?? null,
        status: accountDetails.account_status != null ? String(accountDetails.account_status) : null,
        synced_at: now,
      },
      { onConflict: "enrollment_id,external_account_id" }
    )
    .select("id")
    .single();
  if (accountError || !accountRow) throw new MetaIngestError("Could not save the Meta ad account.", "api");
  const adAccountId = accountRow.id as string;

  // 2) Campaigns
  const campaignsUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${externalAccountId}/campaigns?fields=id,name,status,objective,created_time,updated_time&limit=${PAGE_LIMIT}&access_token=${accessToken}`;
  const campaigns = await paginateMeta<MetaCampaignJson>(campaignsUrl);
  const campaignRows = campaigns.map((c) => ({
    enrollment_id: enrollmentId,
    ad_account_id: adAccountId,
    external_campaign_id: c.id,
    external_account_id: externalAccountId,
    name: c.name ?? null,
    status: c.status ?? null,
    objective: c.objective ?? null,
    created_time: c.created_time ?? null,
    updated_time: c.updated_time ?? null,
    synced_at: now,
  }));
  const { data: upsertedCampaigns, error: campaignError } =
    campaignRows.length > 0
      ? await admin.from("mentorship_meta_campaigns").upsert(campaignRows, { onConflict: "enrollment_id,external_campaign_id" }).select("id, external_campaign_id")
      : { data: [] as { id: string; external_campaign_id: string }[], error: null };
  if (campaignError) throw new MetaIngestError("Could not save Meta campaigns.", "api");
  const campaignIdByExternal = new Map((upsertedCampaigns ?? []).map((r) => [r.external_campaign_id, r.id]));

  // 3) Ad sets
  const adSetsUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${externalAccountId}/adsets?fields=id,name,status,campaign_id,created_time,updated_time&limit=${PAGE_LIMIT}&access_token=${accessToken}`;
  const adSets = await paginateMeta<MetaAdSetJson>(adSetsUrl);
  const adSetRows = adSets.map((a) => ({
    enrollment_id: enrollmentId,
    campaign_id: a.campaign_id ? campaignIdByExternal.get(a.campaign_id) ?? null : null,
    external_ad_set_id: a.id,
    external_campaign_id: a.campaign_id ?? null,
    name: a.name ?? null,
    status: a.status ?? null,
    created_time: a.created_time ?? null,
    updated_time: a.updated_time ?? null,
    synced_at: now,
  }));
  const { data: upsertedAdSets, error: adSetError } =
    adSetRows.length > 0
      ? await admin.from("mentorship_meta_ad_sets").upsert(adSetRows, { onConflict: "enrollment_id,external_ad_set_id" }).select("id, external_ad_set_id")
      : { data: [] as { id: string; external_ad_set_id: string }[], error: null };
  if (adSetError) throw new MetaIngestError("Could not save Meta ad sets.", "api");
  const adSetIdByExternal = new Map((upsertedAdSets ?? []).map((r) => [r.external_ad_set_id, r.id]));

  // 4) Ads
  const adsUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${externalAccountId}/ads?fields=id,name,status,adset_id,campaign_id,created_time,updated_time&limit=${PAGE_LIMIT}&access_token=${accessToken}`;
  const ads = await paginateMeta<MetaAdJson>(adsUrl);
  const adRows = ads.map((a) => ({
    enrollment_id: enrollmentId,
    ad_set_id: a.adset_id ? adSetIdByExternal.get(a.adset_id) ?? null : null,
    campaign_id: a.campaign_id ? campaignIdByExternal.get(a.campaign_id) ?? null : null,
    external_ad_id: a.id,
    external_ad_set_id: a.adset_id ?? null,
    external_campaign_id: a.campaign_id ?? null,
    name: a.name ?? null,
    status: a.status ?? null,
    created_time: a.created_time ?? null,
    updated_time: a.updated_time ?? null,
    synced_at: now,
  }));
  const { data: upsertedAds, error: adError } =
    adRows.length > 0
      ? await admin.from("mentorship_meta_ads").upsert(adRows, { onConflict: "enrollment_id,external_ad_id" }).select("id, external_ad_id")
      : { data: [] as { id: string; external_ad_id: string }[], error: null };
  if (adError) throw new MetaIngestError("Could not save Meta ads.", "api");
  const adIdByExternal = new Map((upsertedAds ?? []).map((r) => [r.external_ad_id, r.id]));

  // 5) Daily ad-level insights over the historical/incremental window
  const windowDays = options.windowDays ?? DEFAULT_META_INSIGHTS_WINDOW_DAYS;
  const until = new Date();
  const since = options.since ? new Date(options.since) : new Date(until.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const timeRange = encodeURIComponent(JSON.stringify({ since: fmt(since), until: fmt(until) }));

  const insightsUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${externalAccountId}/insights?level=ad&fields=ad_id,spend,impressions,reach,clicks,inline_link_clicks,ctr,cpc,cpm,actions,action_values&time_increment=1&time_range=${timeRange}&limit=500&access_token=${accessToken}`;
  const insights = await paginateMeta<MetaInsightJson>(insightsUrl);

  const insightRows = insights.map((i) => {
    const { purchases, purchaseValue } = extractPurchaseMetrics(i);
    return {
      enrollment_id: enrollmentId,
      ad_id: adIdByExternal.get(i.ad_id) ?? null,
      external_ad_id: i.ad_id,
      date: i.date_start,
      spend: toMinorUnits(i.spend),
      impressions: i.impressions != null ? Number(i.impressions) : null,
      reach: i.reach != null ? Number(i.reach) : null,
      clicks: i.clicks != null ? Number(i.clicks) : null,
      link_clicks: i.inline_link_clicks != null ? Number(i.inline_link_clicks) : null,
      ctr: i.ctr != null ? Number(i.ctr) : null,
      cpc: toMinorUnits(i.cpc),
      cpm: toMinorUnits(i.cpm),
      purchases,
      purchase_value: purchaseValue,
      synced_at: now,
    };
  });

  if (insightRows.length > 0) {
    const { error: insightError } = await admin
      .from("mentorship_meta_ad_insights")
      .upsert(insightRows, { onConflict: "enrollment_id,external_ad_id,date" });
    if (insightError) throw new MetaIngestError("Could not save Meta ad insights.", "api");
  }

  return {
    recordsProcessed: campaignRows.length + adSetRows.length + adRows.length + insightRows.length,
    campaignsImported: campaignRows.length,
    adSetsImported: adSetRows.length,
    adsImported: adRows.length,
    insightsImported: insightRows.length,
    windowDays,
  };
}
