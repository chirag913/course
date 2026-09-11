import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ProductNameEditor } from "@/components/products/product-name-editor";
import { ArchiveToggleButton } from "@/components/products/archive-toggle-button";
import { DateRangePicker } from "@/components/products/date-range-picker";
import { MapShopifyForm, type MappableShopifyProduct } from "@/components/products/map-shopify-form";
import { MapMetaForm, type MappableMetaAd } from "@/components/products/map-meta-form";
import { RemoveMappingButton } from "@/components/products/remove-mapping-button";
import { resolveDateRange, DEFAULT_DATE_RANGE_PRESET, type DateRangePreset } from "@/lib/products/date-range";
import { getProductMetrics } from "@/lib/products/metrics";
import { getProductFulfillmentSummary } from "@/lib/shipping/fulfillment";
import { getShopifySuggestedSellingPrice } from "@/lib/economics/selling-price";
import { calculateContributionProfit, calculateBreakEvenRoas, calculateRoas, type EconomicsInputs } from "@/lib/economics/calculate";
import { evaluateEconomicsDataQuality } from "@/lib/economics/data-quality";
import { EconomicsForm } from "@/components/products/economics-form";
import { EvaluateDecisionButton } from "@/components/products/evaluate-decision-button";
import { MentorOverrideForm } from "@/components/products/mentor-override-form";
import { resolveEffectiveDecision } from "@/lib/decisions/effective";
import type {
  MentorshipProductCatalog,
  MentorshipProductShopifyLink,
  MentorshipProductMetaLink,
  MentorshipProductEconomics,
  MentorshipProductDecision,
  MentorshipProductDecisionOverride,
  ProductDecisionState,
} from "@/types/database";

const DECISION_TONE: Record<ProductDecisionState, "success" | "warning" | "neutral" | "brand"> = {
  SCALE: "success",
  RELAUNCH: "brand",
  ITERATE: "warning",
  WATCH: "neutral",
  TEST: "neutral",
  DATA_NEEDED: "warning",
  KILL: "warning",
};

function formatMinor(minor: number | null): string {
  return minor != null ? `₹${(minor / 100).toFixed(2)}` : "—";
}

interface Props {
  params: Promise<{ slug: string; productId: string }>;
  searchParams: Promise<{ range?: string }>;
}

function firstOf<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function ProductDetailPage({ params, searchParams }: Props) {
  const { slug, productId } = await params;
  const { range: rangeParam } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: program } = await supabase
    .from("programs")
    .select("id, slug, title")
    .eq("slug", slug)
    .eq("type_id", "mentorship")
    .maybeSingle();
  if (!program) notFound();

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", user.id)
    .eq("program_id", program.id)
    .maybeSingle();
  if (!enrollment) notFound();

  const { data: productRow } = await supabase
    .from("mentorship_product_catalog")
    .select("*")
    .eq("id", productId)
    .eq("enrollment_id", enrollment.id)
    .maybeSingle();
  if (!productRow) notFound();
  const product = productRow as MentorshipProductCatalog;

  const VALID_PRESETS: DateRangePreset[] = ["today", "yesterday", "7d", "14d", "30d"];
  const preset = VALID_PRESETS.includes(rangeParam as DateRangePreset) ? (rangeParam as DateRangePreset) : DEFAULT_DATE_RANGE_PRESET;
  const range = resolveDateRange(preset);

  const [metrics, fulfillment, shopifyPriceSuggestion, { data: economicsRow }, { count: shippingRowCount }] = await Promise.all([
    getProductMetrics(supabase, enrollment.id, product.id, range),
    getProductFulfillmentSummary(supabase, enrollment.id, product.id, range),
    getShopifySuggestedSellingPrice(supabase, enrollment.id, product.id),
    supabase.from("mentorship_product_economics").select("*").eq("enrollment_id", enrollment.id).eq("product_catalog_id", product.id).maybeSingle(),
    supabase.from("mentorship_shipping_rows").select("*", { count: "exact", head: true }).eq("enrollment_id", enrollment.id),
  ]);

  const economics = economicsRow as MentorshipProductEconomics | null;
  const economicsInputs: EconomicsInputs = {
    sellingPriceMinor: economics?.selling_price_minor ?? null,
    cogsMinor: economics?.cogs_minor ?? null,
    shippingCostMinor: economics?.shipping_cost_minor ?? null,
    codFeeMinor: economics?.cod_fee_minor ?? null,
    packagingCostMinor: economics?.packaging_cost_minor ?? null,
    otherVariableCostMinor: economics?.other_variable_cost_minor ?? null,
    rtoCostMinor: economics?.rto_cost_minor ?? null,
  };

  const contribution = calculateContributionProfit({
    economics: economicsInputs,
    revenue: metrics.shopify.revenue,
    unitsSold: metrics.shopify.unitsSold,
    ordersCount: metrics.shopify.ordersCount,
    rtoCount: fulfillment.counts.rto,
    adSpend: metrics.meta.spend,
  });
  const breakEven = calculateBreakEvenRoas(economicsInputs, fulfillment.rates.rtoRate);
  const roas = calculateRoas({ metaSpend: metrics.meta.spend, metaPurchaseValue: metrics.meta.purchaseValue, shopifyRevenue: metrics.shopify.revenue });

  const dataQualityIssues = evaluateEconomicsDataQuality({
    economics: economics ? economicsInputs : null,
    shopifyMapped: metrics.shopifyMapped,
    metaMapped: metrics.metaMapped,
    sellingPriceAmbiguous: shopifyPriceSuggestion.ambiguous,
    hasAnyShippingData: (shippingRowCount ?? 0) > 0,
    unresolvedFulfillmentCount: fulfillment.counts.unresolved,
    metaSpend: metrics.meta.spend,
  });

  const isAdmin = user.profile.role === "admin";
  const { data: decisionHistoryRows } = await supabase
    .from("mentorship_product_decisions")
    .select("*")
    .eq("enrollment_id", enrollment.id)
    .eq("product_catalog_id", product.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const { data: overrideHistoryRows } = await supabase
    .from("mentorship_product_decision_overrides")
    .select("*")
    .eq("enrollment_id", enrollment.id)
    .eq("product_catalog_id", product.id)
    .order("created_at", { ascending: false })
    .limit(1);

  const decisionHistory = (decisionHistoryRows ?? []) as MentorshipProductDecision[];
  const latestOverride = (overrideHistoryRows?.[0] ?? null) as MentorshipProductDecisionOverride | null;
  const effective = resolveEffectiveDecision(decisionHistory[0] ?? null, latestOverride);

  const [{ data: shopifyLinkRows }, { data: metaLinkRows }] = await Promise.all([
    supabase
      .from("mentorship_product_shopify_links")
      .select("*, mentorship_shopify_products(title), mentorship_shopify_product_variants(title, sku)")
      .eq("enrollment_id", enrollment.id)
      .eq("product_catalog_id", product.id),
    supabase
      .from("mentorship_product_meta_links")
      .select("*, mentorship_meta_ads(name, mentorship_meta_ad_sets(name), mentorship_meta_campaigns(name))")
      .eq("enrollment_id", enrollment.id)
      .eq("product_catalog_id", product.id),
  ]);

  const shopifyLinks = (shopifyLinkRows ?? []) as (MentorshipProductShopifyLink & {
    mentorship_shopify_products: { title: string } | { title: string }[] | null;
    mentorship_shopify_product_variants: { title: string | null; sku: string | null } | { title: string | null; sku: string | null }[] | null;
  })[];
  const metaLinks = (metaLinkRows ?? []) as (MentorshipProductMetaLink & {
    mentorship_meta_ads:
      | { name: string | null; mentorship_meta_ad_sets: { name: string | null } | { name: string | null }[] | null; mentorship_meta_campaigns: { name: string | null } | { name: string | null }[] | null }
      | { name: string | null; mentorship_meta_ad_sets: { name: string | null } | { name: string | null }[] | null; mentorship_meta_campaigns: { name: string | null } | { name: string | null }[] | null }[]
      | null;
  })[];

  // Options for the mapping forms: only Shopify products/variants and Meta
  // ads NOT already claimed by another catalog product (a claimed one can't
  // be mapped again — the DB's unique constraints would reject it anyway,
  // this just keeps the picker from offering doomed choices).
  const [{ data: allShopifyProducts }, { data: allVariants }, { data: allShopifyLinksInEnrollment }, { data: allMetaAds }, { data: allMetaLinksInEnrollment }] =
    await Promise.all([
      supabase.from("mentorship_shopify_products").select("id, title").eq("enrollment_id", enrollment.id).order("title"),
      supabase.from("mentorship_shopify_product_variants").select("id, product_id, title, sku").eq("enrollment_id", enrollment.id),
      supabase.from("mentorship_product_shopify_links").select("shopify_product_id, shopify_variant_id").eq("enrollment_id", enrollment.id),
      supabase
        .from("mentorship_meta_ads")
        .select("id, name, mentorship_meta_ad_sets(name), mentorship_meta_campaigns(name)")
        .eq("enrollment_id", enrollment.id)
        .order("name"),
      supabase.from("mentorship_product_meta_links").select("meta_ad_id").eq("enrollment_id", enrollment.id),
    ]);

  const claimedWholeProducts = new Set((allShopifyLinksInEnrollment ?? []).filter((l) => !l.shopify_variant_id).map((l) => l.shopify_product_id as string));
  const claimedVariants = new Set((allShopifyLinksInEnrollment ?? []).filter((l) => l.shopify_variant_id).map((l) => l.shopify_variant_id as string));
  const mappableShopifyProducts: MappableShopifyProduct[] = (allShopifyProducts ?? [])
    .filter((p) => !claimedWholeProducts.has(p.id as string))
    .map((p) => ({
      id: p.id as string,
      title: p.title as string,
      variants: (allVariants ?? [])
        .filter((v) => v.product_id === p.id && !claimedVariants.has(v.id as string))
        .map((v) => ({ id: v.id as string, title: v.title as string | null, sku: v.sku as string | null })),
    }));

  const claimedAdIds = new Set((allMetaLinksInEnrollment ?? []).map((l) => l.meta_ad_id as string));
  const mappableMetaAds: MappableMetaAd[] = (allMetaAds ?? [])
    .filter((a) => !claimedAdIds.has(a.id as string))
    .map((a) => ({
      id: a.id as string,
      name: a.name as string | null,
      adSetName: firstOf(a.mentorship_meta_ad_sets as { name: string | null } | { name: string | null }[] | null)?.name ?? null,
      campaignName: firstOf(a.mentorship_meta_campaigns as { name: string | null } | { name: string | null }[] | null)?.name ?? null,
    }));

  return (
    <div>
      <Link href={`/dashboard/mentorship/${slug}/products`} className="mb-6 inline-flex items-center text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="mr-1 h-3.5 w-3.5" />
        Back to products
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ProductNameEditor enrollmentId={enrollment.id} productId={product.id} name={product.name} />
        <div className="flex items-center gap-2">
          <Badge tone={product.status === "active" ? "success" : "neutral"}>{product.status.toUpperCase()}</Badge>
          <ArchiveToggleButton enrollmentId={enrollment.id} productId={product.id} status={product.status} />
        </div>
      </div>

      <div className="mt-4">
        <DateRangePicker current={preset} />
      </div>

      {/* PRODUCT DECISION — deterministic, no AI. See PHASE_E_DECISION_ENGINE.md */}
      <section className={`mt-6 border-2 p-5 ${effective.effectiveDecision ? "border-ink-900" : "border-ink-300"}`}>
        {effective.effectiveDecision ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Badge tone={DECISION_TONE[effective.effectiveDecision]}>{effective.effectiveDecision.replace("_", " ")}</Badge>
                <p className="mt-2 font-display text-2xl font-bold tracking-tight text-ink-900">
                  {effective.isOverridden ? effective.activeOverride!.override_reason : effective.engineDecision!.why}
                </p>
              </div>
              <EvaluateDecisionButton enrollmentId={enrollment.id} productCatalogId={product.id} rangePreset={preset} />
            </div>

            {effective.isOverridden && effective.engineDecision && (
              <div className="mt-3 rounded-md border border-ink-300 bg-ink-100 p-3 text-sm">
                <p className="text-ink-700">
                  <span className="font-medium">System decision:</span> {effective.engineDecision.decision.replace("_", " ")}
                </p>
                <p className="mt-1 text-ink-700">
                  <span className="font-medium">Mentor override:</span> {effective.activeOverride!.override_decision.replace("_", " ")}
                </p>
                <p className="mt-1 text-ink-700">
                  <span className="font-medium">Reason:</span> {effective.activeOverride!.override_reason}
                </p>
              </div>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="font-mono text-xs uppercase text-ink-500">Why</p>
                <ul className="mt-1 space-y-1 text-sm text-ink-700">
                  {effective.engineDecision!.evidence.map((line, i) => (
                    <li key={i}>• {line}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-mono text-xs uppercase text-ink-500">Next action</p>
                <p className="mt-1 text-sm text-ink-900">{effective.engineDecision!.next_action}</p>
                <p className="mt-2 font-mono text-xs text-ink-500">
                  Priority: {effective.engineDecision!.priority.toUpperCase()} · Engine {effective.engineDecision!.engine_version} ·{" "}
                  {formatDate(effective.engineDecision!.created_at)}
                </p>
              </div>
            </div>

            {isAdmin && <MentorOverrideForm enrollmentId={enrollment.id} productCatalogId={product.id} />}
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-500">No decision has been evaluated yet for this product.</p>
            <EvaluateDecisionButton enrollmentId={enrollment.id} productCatalogId={product.id} rangePreset={preset} />
          </div>
        )}
      </section>

      {/* 1. Overview */}
      <section className="mt-6 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Overview</h2>
        <p className="mt-1 text-sm text-ink-500">Raw observations for {range.label.toLowerCase()}.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Shopify orders" value={metrics.shopify.ordersCount} />
          <Metric label="Shopify units" value={metrics.shopify.unitsSold} />
          <Metric label="Shopify revenue" value={`₹${(metrics.shopify.revenue / 100).toFixed(2)}`} />
          <Metric label="Meta spend" value={metrics.meta.spend != null ? `₹${(metrics.meta.spend / 100).toFixed(2)}` : "—"} />
          <Metric label="Meta purchases" value={metrics.meta.purchases ?? "—"} />
          <Metric
            label="Meta purchase value"
            value={metrics.meta.purchaseValue != null ? `₹${(metrics.meta.purchaseValue / 100).toFixed(2)}` : "—"}
          />
          <Metric label="CTR" value={metrics.meta.ctr != null ? `${metrics.meta.ctr.toFixed(2)}%` : "—"} />
          <Metric label="CPC" value={metrics.meta.cpc != null ? `₹${(metrics.meta.cpc / 100).toFixed(2)}` : "—"} />
        </div>
      </section>

      {/* 2. Economics */}
      <section className="mt-6 border-2 border-ink-400 p-5">
        <h2 className="font-display text-xl font-semibold text-ink-900">Economics</h2>
        <p className="mt-1 text-sm text-ink-500">
          Persistent configuration — these values don&apos;t change with the date range above; the profit/ROAS numbers below do.
        </p>

        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between border-b border-ink-300 py-1.5">
            <span className="text-ink-600">Revenue</span>
            <span className="font-medium text-ink-900">{formatMinor(contribution.revenue)}</span>
          </div>
          <div className="flex justify-between border-b border-ink-300 py-1.5">
            <span className="text-ink-600">Ad Spend</span>
            <span className="font-medium text-ink-900">{formatMinor(contribution.adSpend)}</span>
          </div>
          <div className="flex justify-between border-b border-ink-300 py-1.5">
            <span className="text-ink-600">COGS</span>
            <span className="font-medium text-ink-900">{formatMinor(contribution.cogsTotal)}</span>
          </div>
          <div className="flex justify-between border-b border-ink-300 py-1.5">
            <span className="text-ink-600">Shipping</span>
            <span className="font-medium text-ink-900">{formatMinor(contribution.shippingTotal)}</span>
          </div>
          <div className="flex justify-between border-b border-ink-300 py-1.5">
            <span className="text-ink-600">COD Fees</span>
            <span className="font-medium text-ink-900">{formatMinor(contribution.codTotal)}</span>
          </div>
          <div className="flex justify-between border-b border-ink-300 py-1.5">
            <span className="text-ink-600">Packaging</span>
            <span className="font-medium text-ink-900">{formatMinor(contribution.packagingTotal)}</span>
          </div>
          <div className="flex justify-between border-b border-ink-300 py-1.5">
            <span className="text-ink-600">Other Variable Costs</span>
            <span className="font-medium text-ink-900">{formatMinor(contribution.otherVariableTotal)}</span>
          </div>
          <div className="flex justify-between border-b border-ink-300 py-1.5">
            <span className="text-ink-600">RTO Costs ({fulfillment.counts.rto} RTO&apos;d order{fulfillment.counts.rto === 1 ? "" : "s"})</span>
            <span className="font-medium text-ink-900">{formatMinor(contribution.rtoTotal)}</span>
          </div>
        </div>

        <div className="mt-3 flex justify-between border-t-2 border-ink-400 pt-3">
          <span className="font-display text-lg font-semibold text-ink-900">Contribution Profit</span>
          <span className="font-display text-lg font-semibold text-ink-900">
            {contribution.contributionProfit != null ? formatMinor(contribution.contributionProfit) : "Incomplete data"}
          </span>
        </div>
        {contribution.missingInputs.length > 0 && (
          <p className="mt-1 text-xs text-danger">Missing: {contribution.missingInputs.join(", ")}</p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-ink-300 p-3">
            <p className="font-mono text-[11px] uppercase text-ink-500">Meta ROAS (attributed)</p>
            <p className="mt-1 text-lg font-semibold text-ink-900">{roas.metaRoas != null ? `${roas.metaRoas.toFixed(2)}x` : "—"}</p>
          </div>
          <div className="rounded-md border border-ink-300 p-3">
            <p className="font-mono text-[11px] uppercase text-ink-500">Blended ROAS (Shopify revenue ÷ Meta spend)</p>
            <p className="mt-1 text-lg font-semibold text-ink-900">{roas.blendedRoas != null ? `${roas.blendedRoas.toFixed(2)}x` : "—"}</p>
          </div>
          <div className="rounded-md border border-ink-300 p-3">
            <p className="font-mono text-[11px] uppercase text-ink-500">Break-even ROAS</p>
            <p className="mt-1 text-lg font-semibold text-ink-900">{breakEven.value != null ? `${breakEven.value.toFixed(2)}x` : "Unavailable"}</p>
            {breakEven.reason && <p className="mt-1 text-xs text-ink-500">{breakEven.reason}</p>}
          </div>
        </div>

        <div className="mt-6 border-t border-ink-300 pt-4">
          <h3 className="font-medium text-ink-900">Edit inputs</h3>
          <div className="mt-3">
            <EconomicsForm
              enrollmentId={enrollment.id}
              productCatalogId={product.id}
              existing={economics}
              shopifySuggestedPriceMinor={shopifyPriceSuggestion.priceMinor}
              shopifyPriceAmbiguous={shopifyPriceSuggestion.ambiguous}
            />
          </div>
        </div>
      </section>

      {/* 3. Fulfillment */}
      <section className="mt-6 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Fulfillment</h2>
        <p className="mt-1 text-sm text-ink-500">
          For {range.label.toLowerCase()}.{" "}
          <Link href={`/dashboard/mentorship/${slug}/shipping`} className="text-brand-300 underline">
            Manage shipping data
          </Link>
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Orders" value={fulfillment.counts.ordersCount} />
          <Metric label="Shipped" value={fulfillment.counts.shipped} />
          <Metric label="Delivered" value={fulfillment.counts.delivered} />
          <Metric label="NDR" value={fulfillment.counts.ndr} />
          <Metric label="RTO" value={fulfillment.counts.rto} />
          <Metric label="Unknown / Needs Review" value={fulfillment.counts.unresolved} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric label="Delivery Rate" value={fulfillment.rates.deliveryRate != null ? `${fulfillment.rates.deliveryRate.toFixed(1)}%` : "Not enough data"} />
          <Metric label="RTO Rate" value={fulfillment.rates.rtoRate != null ? `${fulfillment.rates.rtoRate.toFixed(1)}%` : "Not enough data"} />
          <Metric label="NDR Rate" value={fulfillment.rates.ndrRate != null ? `${fulfillment.rates.ndrRate.toFixed(1)}%` : "Not enough data"} />
        </div>
      </section>

      {/* 4. Meta */}
      <section className="mt-6 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Meta</h2>
        {metaLinks.length === 0 ? (
          <p className="mt-2 text-sm text-ink-500">Not mapped to any Meta ad yet — use the Mapping section below.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {metaLinks.map((link) => {
              const ad = firstOf(link.mentorship_meta_ads);
              const adSetName = ad ? firstOf(ad.mentorship_meta_ad_sets)?.name : null;
              const campaignName = ad ? firstOf(ad.mentorship_meta_campaigns)?.name : null;
              return (
                <div key={link.id} className="rounded-md border border-ink-300 p-3">
                  <p className="font-medium text-ink-900">{[campaignName, adSetName, ad?.name].filter(Boolean).join(" → ") || "Untitled ad"}</p>
                  <p className="font-mono text-xs text-ink-500">{link.match_method} · {link.confidence}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. Shopify */}
      <section className="mt-6 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Shopify</h2>
        {shopifyLinks.length === 0 ? (
          <p className="mt-2 text-sm text-ink-500">Not mapped to any Shopify product yet — use the Mapping section below.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {shopifyLinks.map((link) => {
              const productTitle = firstOf(link.mentorship_shopify_products)?.title ?? "Unknown product";
              const variant = firstOf(link.mentorship_shopify_product_variants);
              return (
                <div key={link.id} className="rounded-md border border-ink-300 p-3">
                  <p className="font-medium text-ink-900">{productTitle}</p>
                  <p className="font-mono text-xs text-ink-500">
                    {variant ? `Variant: ${variant.title ?? variant.sku ?? "—"}` : "All variants"} · {link.match_method} · {link.confidence}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 6. Mapping */}
      <section className="mt-6 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Mapping</h2>

        <div className="mt-4">
          <h3 className="font-medium text-ink-900">Shopify</h3>
          <p className="mt-1 text-sm text-ink-500">
            PRODUCT: {product.name}
          </p>
          <div className="mt-2 space-y-2">
            {shopifyLinks.map((link) => (
              <div key={link.id} className="flex items-center justify-between rounded-md border border-ink-300 p-2">
                <span className="text-sm text-ink-700">
                  {firstOf(link.mentorship_shopify_products)?.title}
                  {firstOf(link.mentorship_shopify_product_variants) ? ` — ${firstOf(link.mentorship_shopify_product_variants)?.title ?? ""}` : ""}
                </span>
                <RemoveMappingButton enrollmentId={enrollment.id} productCatalogId={product.id} linkId={link.id} provider="shopify" />
              </div>
            ))}
          </div>
          <div className="mt-3">
            <MapShopifyForm enrollmentId={enrollment.id} productCatalogId={product.id} products={mappableShopifyProducts} />
          </div>
        </div>

        <div className="mt-6 border-t border-ink-300 pt-4">
          <h3 className="font-medium text-ink-900">Meta</h3>
          <div className="mt-2 space-y-2">
            {metaLinks.map((link) => {
              const ad = firstOf(link.mentorship_meta_ads);
              const adSetName = ad ? firstOf(ad.mentorship_meta_ad_sets)?.name : null;
              const campaignName = ad ? firstOf(ad.mentorship_meta_campaigns)?.name : null;
              return (
                <div key={link.id} className="flex items-center justify-between rounded-md border border-ink-300 p-2">
                  <span className="text-sm text-ink-700">{[campaignName, adSetName, ad?.name].filter(Boolean).join(" → ")}</span>
                  <RemoveMappingButton enrollmentId={enrollment.id} productCatalogId={product.id} linkId={link.id} provider="meta" />
                </div>
              );
            })}
          </div>
          <div className="mt-3">
            <MapMetaForm enrollmentId={enrollment.id} productCatalogId={product.id} ads={mappableMetaAds} />
          </div>
        </div>
      </section>

      {/* 7. Data Quality */}
      <section className="mt-6 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Data Quality</h2>
        <p className="mt-1 text-sm text-ink-500">Why any number above might be missing or approximate.</p>
        {dataQualityIssues.length === 0 ? (
          <p className="mt-3 text-sm text-success">All inputs are complete for this product.</p>
        ) : (
          <ul className="mt-3 space-y-1.5 text-sm">
            {dataQualityIssues.map((issue, i) => (
              <li key={i} className={issue.level === "incomplete" ? "text-danger" : "text-ink-700"}>
                • {issue.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Decision History — append-only, see PHASE_E_DECISION_ENGINE.md */}
      <section className="mt-6 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Decision History</h2>
        {decisionHistory.length === 0 ? (
          <p className="mt-2 text-sm text-ink-500">No decisions recorded yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {decisionHistory.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-md border border-ink-300 p-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={DECISION_TONE[d.decision]}>{d.decision.replace("_", " ")}</Badge>
                    <span className="text-sm text-ink-700">{d.why}</span>
                  </div>
                  {latestOverride && latestOverride.created_at > d.created_at && (
                    <p className="mt-1 font-mono text-xs text-ink-500">Later overridden to {latestOverride.override_decision.replace("_", " ")}</p>
                  )}
                </div>
                <p className="font-mono text-xs text-ink-500">
                  {formatDate(d.created_at)} · engine {d.engine_version}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-ink-300 p-3">
      <p className="font-mono text-[11px] uppercase text-ink-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink-900">{value}</p>
    </div>
  );
}
