import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { AddProductForm } from "@/components/products/add-product-form";
import { DiscoverShopifyButton } from "@/components/products/discover-shopify-button";
import { getUnmappedShopifyProducts, getUnmappedMetaAds } from "@/lib/products/unmapped";
import { resolveDateRange, DEFAULT_DATE_RANGE_PRESET } from "@/lib/products/date-range";
import { getProductPortfolio } from "@/lib/products/portfolio";
import type {
  MentorshipProductShopifyLink,
  MentorshipProductMetaLink,
  ProductMatchConfidence,
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

interface Props {
  params: Promise<{ slug: string }>;
}

const CONFIDENCE_RANK: Record<ProductMatchConfidence, number> = { low: 0, medium: 1, high: 2 };
const CONFIDENCE_TONE: Record<ProductMatchConfidence, "success" | "warning" | "neutral"> = {
  high: "success",
  medium: "warning",
  low: "warning",
};

function weakestConfidence(confidences: ProductMatchConfidence[]): ProductMatchConfidence | null {
  if (confidences.length === 0) return null;
  return confidences.reduce((weakest, c) => (CONFIDENCE_RANK[c] < CONFIDENCE_RANK[weakest] ? c : weakest));
}

export default async function ProductsPage({ params }: Props) {
  const { slug } = await params;
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

  const [{ data: shopifyLinkRows }, { data: metaLinkRows }, { data: syncRows }] = await Promise.all([
    supabase.from("mentorship_product_shopify_links").select("*").eq("enrollment_id", enrollment.id),
    supabase.from("mentorship_product_meta_links").select("*").eq("enrollment_id", enrollment.id),
    supabase
      .from("mentorship_data_syncs")
      .select("provider, last_successful_sync_at")
      .eq("enrollment_id", enrollment.id)
      .not("last_successful_sync_at", "is", null)
      .order("created_at", { ascending: false }),
  ]);

  const shopifyLinks = (shopifyLinkRows ?? []) as MentorshipProductShopifyLink[];
  const metaLinks = (metaLinkRows ?? []) as MentorshipProductMetaLink[];

  const lastSyncByProvider = new Map<string, string>();
  for (const row of syncRows ?? []) {
    if (!lastSyncByProvider.has(row.provider) && row.last_successful_sync_at) {
      lastSyncByProvider.set(row.provider, row.last_successful_sync_at);
    }
  }

  const unmappedRange = resolveDateRange(DEFAULT_DATE_RANGE_PRESET);
  const [unmappedShopify, unmappedMeta, portfolio] = await Promise.all([
    getUnmappedShopifyProducts(supabase, enrollment.id),
    getUnmappedMetaAds(supabase, enrollment.id, unmappedRange),
    getProductPortfolio(supabase, enrollment.id, unmappedRange, { statusFilter: "all" }),
  ]);
  const products = portfolio.map((entry) => entry.product);
  const portfolioByProduct = new Map(portfolio.map((entry) => [entry.product.id, entry]));

  return (
    <div>
      <Link href={`/dashboard/mentorship/${slug}`} className="mb-6 inline-flex items-center text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="mr-1 h-3.5 w-3.5" />
        Back to dashboard
      </Link>

      <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">Products</h1>
      <p className="mt-1 text-sm text-ink-500">
        Your canonical product catalog, mapping, economics, and the deterministic decision for each product.
      </p>

      <div className="mt-3 flex flex-wrap gap-4 font-mono text-xs text-ink-500">
        <span>Last Shopify sync: {lastSyncByProvider.has("shopify") ? formatDate(lastSyncByProvider.get("shopify")!) : "Not synced yet"}</span>
        <span>Last Meta sync: {lastSyncByProvider.has("meta") ? formatDate(lastSyncByProvider.get("meta")!) : "Not synced yet"}</span>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <AddProductForm enrollmentId={enrollment.id} />
        <DiscoverShopifyButton enrollmentId={enrollment.id} />
      </div>

      <div className="mt-8 overflow-x-auto border border-ink-300">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-ink-300 text-left font-mono text-xs uppercase text-ink-500">
              <th className="p-3">Product</th>
              <th className="p-3">Decision</th>
              <th className="p-3">Priority</th>
              <th className="p-3">ROAS</th>
              <th className="p-3">Break-even ROAS</th>
              <th className="p-3">Contribution Profit</th>
              <th className="p-3">RTO Rate</th>
              <th className="p-3">Mapping</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-4 text-center text-ink-500">
                  No products yet. Add one above, or scan Shopify for products already in your store.
                </td>
              </tr>
            ) : (
              products.map((product) => {
                const ownShopifyLinks = shopifyLinks.filter((l) => l.product_catalog_id === product.id);
                const ownMetaLinks = metaLinks.filter((l) => l.product_catalog_id === product.id);
                const confidences = [...ownShopifyLinks, ...ownMetaLinks].map((l) => l.confidence);
                const confidence = weakestConfidence(confidences);
                const entry = portfolioByProduct.get(product.id);

                return (
                  <tr key={product.id} className="border-b border-ink-300 last:border-b-0">
                    <td className="p-3">
                      <Link href={`/dashboard/mentorship/${slug}/products/${product.id}`} className="font-medium text-ink-900 hover:underline">
                        {product.name}
                      </Link>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Badge tone={ownShopifyLinks.length > 0 ? "success" : "neutral"}>{ownShopifyLinks.length > 0 ? "Shopify" : "No Shopify"}</Badge>
                        <Badge tone={ownMetaLinks.length > 0 ? "success" : "neutral"}>{ownMetaLinks.length > 0 ? "Meta" : "No Meta"}</Badge>
                      </div>
                    </td>
                    <td className="p-3">
                      {entry?.effectiveDecision ? (
                        <Badge tone={DECISION_TONE[entry.effectiveDecision]}>{entry.effectiveDecision.replace("_", " ")}</Badge>
                      ) : (
                        <span className="text-ink-500">Not evaluated</span>
                      )}
                    </td>
                    <td className="p-3 font-mono text-xs uppercase text-ink-700">{entry?.priority ?? "—"}</td>
                    <td className="p-3 text-ink-700">{entry?.blendedRoas != null ? `${entry.blendedRoas.toFixed(2)}x` : "—"}</td>
                    <td className="p-3 text-ink-700">{entry?.breakEvenRoas != null ? `${entry.breakEvenRoas.toFixed(2)}x` : "—"}</td>
                    <td className="p-3 text-ink-700">{entry?.contributionProfit != null ? `₹${(entry.contributionProfit / 100).toFixed(2)}` : "—"}</td>
                    <td className="p-3 text-ink-700">{entry?.rtoRate != null ? `${entry.rtoRate.toFixed(1)}%` : "—"}</td>
                    <td className="p-3">
                      {confidence ? <Badge tone={CONFIDENCE_TONE[confidence]}>{confidence.toUpperCase()}</Badge> : <span className="text-ink-500">—</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <section className="mt-8 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Unmapped Shopify products</h2>
        <p className="mt-1 text-sm text-ink-500">Synced from Shopify but not yet linked to a canonical product.</p>
        <div className="mt-3 space-y-2">
          {unmappedShopify.length === 0 ? (
            <p className="text-sm text-ink-500">Nothing unmapped.</p>
          ) : (
            unmappedShopify.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-md border border-ink-300 p-3">
                <div>
                  <p className="font-medium text-ink-900">{p.title}</p>
                  <p className="font-mono text-xs text-ink-500">{p.vendor ?? "—"}</p>
                </div>
                <p className="text-sm text-ink-500">Open a product&apos;s Mapping tab to map this.</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="mt-6 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Unmapped Meta ads</h2>
        <p className="mt-1 text-sm text-ink-500">
          Synced from Meta but not yet linked to a canonical product. Spend shown is for {unmappedRange.label.toLowerCase()}.
        </p>
        <div className="mt-3 space-y-2">
          {unmappedMeta.length === 0 ? (
            <p className="text-sm text-ink-500">Nothing unmapped.</p>
          ) : (
            unmappedMeta.map((ad) => (
              <div key={ad.id} className="flex items-center justify-between rounded-md border border-ink-300 p-3">
                <div>
                  <p className="font-medium text-ink-900">{[ad.campaignName, ad.adSetName, ad.name].filter(Boolean).join(" → ") || "Untitled ad"}</p>
                  <p className="font-mono text-xs text-ink-500">Spend: {ad.spend != null ? `₹${(ad.spend / 100).toFixed(2)}` : "—"}</p>
                </div>
                <p className="text-sm text-ink-500">Open a product&apos;s Mapping tab to map this.</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
