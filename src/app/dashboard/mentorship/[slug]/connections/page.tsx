import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, Megaphone, PackageCheck, ShoppingBag, Truck } from "lucide-react";
import { ConnectShopifyForm } from "@/components/connections/connect-shopify-form";
import { ConnectMetaButton } from "@/components/connections/connect-meta-button";
import { DisconnectButton } from "@/components/connections/disconnect-button";
import { SyncNowButton } from "@/components/connections/sync-now-button";
import { SyncAllButton } from "@/components/connections/sync-all-button";
import { ConnectShiprocketForm } from "@/components/connections/connect-shiprocket-form";
import { ShopifyCsvUploadForm } from "@/components/connections/shopify-csv-upload-form";
import { ShippingCsvUploadForm } from "@/components/shipping/shipping-csv-upload-form";
import type { MentorshipConnection, MentorshipConnectionProvider, MentorshipDataSync } from "@/types/database";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ connected?: string }>;
}

const PROVIDER_LABEL: Record<MentorshipConnectionProvider, string> = {
  shopify: "Shopify",
  meta: "Meta Ads",
  shiprocket: "Shiprocket",
};

export default async function ConnectionsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { connected } = await searchParams;
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

  const { data: connectionRows } = await supabase
    .from("mentorship_connections")
    .select("*")
    .eq("enrollment_id", enrollment.id)
    .order("created_at", { ascending: false });

  const connections = (connectionRows ?? []) as MentorshipConnection[];
  const latestByProvider = new Map<MentorshipConnectionProvider, MentorshipConnection>();
  for (const c of connections) {
    if (!latestByProvider.has(c.provider)) latestByProvider.set(c.provider, c);
  }

  const shopify = latestByProvider.get("shopify");
  const meta = latestByProvider.get("meta");
  const shiprocket = latestByProvider.get("shiprocket");

  const { data: syncRows } = await supabase
    .from("mentorship_data_syncs")
    .select("*")
    .eq("enrollment_id", enrollment.id)
    .order("created_at", { ascending: false });

  const latestSyncByProvider = new Map<MentorshipConnectionProvider, MentorshipDataSync>();
  for (const s of (syncRows ?? []) as MentorshipDataSync[]) {
    if (!latestSyncByProvider.has(s.provider)) latestSyncByProvider.set(s.provider, s);
  }

  const [{ count: orderCount }, { count: adCount }, { count: shippingCount }, { count: shopifyProductCount }, { count: mappedProductCount }] = await Promise.all([
    supabase.from("mentorship_shopify_orders").select("id", { count: "exact", head: true }).eq("enrollment_id", enrollment.id),
    supabase.from("mentorship_meta_ads").select("id", { count: "exact", head: true }).eq("enrollment_id", enrollment.id),
    supabase.from("mentorship_shipping_rows").select("id", { count: "exact", head: true }).eq("enrollment_id", enrollment.id),
    supabase.from("mentorship_shopify_products").select("id", { count: "exact", head: true }).eq("enrollment_id", enrollment.id),
    supabase.from("mentorship_product_shopify_links").select("id", { count: "exact", head: true }).eq("enrollment_id", enrollment.id),
  ]);
  const connectedCount = [shopify, meta, shiprocket].filter((connection) => connection?.status === "connected").length;
  const lastUpdated = [shopify, meta, shiprocket]
    .map((connection) => connection?.last_synced_at)
    .filter((date): date is string => Boolean(date))
    .sort()
    .pop();

  return (
    <div>
      <Link
        href={`/dashboard/mentorship/${slug}`}
        className="mb-6 inline-flex items-center text-sm text-ink-500 hover:text-ink-900"
      >
        <ArrowLeft className="mr-1 h-3.5 w-3.5" />
        Back to dashboard
      </Link>

      <div className="flex flex-col gap-5 border-b border-ink-300 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink-900">Connect your store &amp; business data</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-600">Connect your accounts so your mentor can see your real business performance and help you make better decisions.</p>
        </div>
        <div className="min-w-56 rounded-md border border-ink-300 bg-ink-100/60 px-4 py-3">
          <div className="flex items-center justify-between text-sm"><span className="font-semibold text-ink-900">Your data connections</span><span className="text-ink-600">{connectedCount} of 3 connected</span></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-300"><div className="h-full rounded-full bg-success" style={{ width: `${(connectedCount / 3) * 100}%` }} /></div>
          <div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-ink-600">{lastUpdated ? `Updated ${formatDate(lastUpdated)}` : "No data synced yet"}</span><SyncAllButton enrollmentId={enrollment.id} /></div>
        </div>
      </div>

      {connected && (
        <p className="mt-4 rounded-md border border-success/40 bg-success/10 px-4 py-2 text-sm text-success">
          {PROVIDER_LABEL[connected as MentorshipConnectionProvider] ?? connected} connected successfully.
        </p>
      )}

      <div className="mt-8 grid gap-4 xl:grid-cols-3">
        <ConnectionCard
          provider="shopify"
          connection={shopify}
          sync={latestSyncByProvider.get("shopify")}
          enrollmentId={enrollment.id}
          connectForm={<ConnectShopifyForm enrollmentId={enrollment.id} />}
          icon={<ShoppingBag className="h-5 w-5" />}
          description="Products, orders, revenue, units sold, selling prices, and order statuses."
          dataLabel={orderCount ? `${orderCount} orders imported` : "No orders imported yet"}
        />
        <ConnectionCard
          provider="meta"
          connection={meta}
          sync={latestSyncByProvider.get("meta")}
          enrollmentId={enrollment.id}
          connectForm={<ConnectMetaButton enrollmentId={enrollment.id} />}
          icon={<Megaphone className="h-5 w-5" />}
          description="Campaigns, ad sets, ads, spend, impressions, clicks, CTR, CPC, purchases, and ROAS where available."
          dataLabel={adCount ? `${adCount} ads imported` : "No ads imported yet"}
        />
        <ConnectionCard
          provider="shiprocket"
          connection={shiprocket}
          sync={latestSyncByProvider.get("shiprocket")}
          enrollmentId={enrollment.id}
          connectForm={<ConnectShiprocketForm enrollmentId={enrollment.id} />}
          icon={<Truck className="h-5 w-5" />}
          description="Shipments, delivery status, delivered orders, NDR, RTO, and reliable shipment identifiers."
          dataLabel={shippingCount ? `${shippingCount} shipping records imported` : "Fulfillment data unavailable"}
        />
      </div>

      <section className="mt-6 border border-ink-300 p-5">
        <div className="flex items-center gap-2"><PackageCheck className="h-5 w-5 text-brand-300" /><h2 className="font-display text-lg font-semibold text-ink-900">Import data your way</h2></div>
        <p className="mt-1 text-sm text-ink-600">CSV imports are a first-class option when an API connection is not right for your business.</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <ImportOption title="Shopify orders CSV" description="Export your orders from Shopify and upload the standard orders CSV." ><ShopifyCsvUploadForm enrollmentId={enrollment.id} /></ImportOption>
          <ImportOption title="Shiprocket CSV" description="Upload a Shiprocket export. Confirm the detected order and status columns before import."><ShippingCsvUploadForm enrollmentId={enrollment.id} source="shiprocket_csv" label="Upload Shiprocket CSV" /></ImportOption>
          <ImportOption title="Generic shipping CSV" description="Use a shipping or fulfillment report from any provider. Unmatched rows stay in review."><ShippingCsvUploadForm enrollmentId={enrollment.id} label="Upload shipping CSV" /></ImportOption>
        </div>
      </section>

      {shopify?.status === "connected" && (
        <section className="mt-6 flex flex-col gap-4 border border-ink-300 p-5 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="font-display text-lg font-semibold text-ink-900">Your products</h2><p className="mt-1 text-sm text-ink-600">Shopify products detected: {shopifyProductCount ?? 0} · Mapped to mentorship products: {mappedProductCount ?? 0}.</p></div>
          <Link href={`/dashboard/mentorship/${slug}/products`} className="text-sm font-semibold text-brand-300 hover:text-brand-400">Review product mapping</Link>
        </section>
      )}

      <section className="mt-6 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Data status</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
          <DataStatus label="Shopify" connected={shopify?.status === "connected"} detail={orderCount ? `${orderCount} orders` : "No orders yet"} />
          <DataStatus label="Meta Ads" connected={meta?.status === "connected"} detail={adCount ? `${adCount} ads` : "No ad data yet"} />
          <DataStatus label="Fulfillment" connected={shiprocket?.status === "connected" || Boolean(shippingCount)} detail={shippingCount ? `${shippingCount} records` : "Not connected"} />
        </div>
      </section>
    </div>
  );
}

function ConnectionCard({
  provider,
  connection,
  sync,
  enrollmentId,
  connectForm,
  icon,
  description,
  dataLabel,
}: {
  provider: MentorshipConnectionProvider;
  connection: MentorshipConnection | undefined;
  sync: MentorshipDataSync | undefined;
  enrollmentId: string;
  connectForm: React.ReactNode;
  icon: React.ReactNode;
  description: string;
  dataLabel: string;
}) {
  const label = PROVIDER_LABEL[provider];
  const isConnected = connection?.status === "connected";
  const isPending = connection?.status === "pending_selection";
  const isSyncRunning = sync?.status === "running";
  const syncFailed = sync?.status === "failed";

  return (
    <div className="flex min-h-[390px] flex-col border border-ink-300 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-ink-900">{icon}<h2 className="font-display text-lg font-semibold">{label}</h2></div>
        {isConnected && <Badge tone="success">Connected</Badge>}
        {isPending && <Badge tone="warning">Pending selection</Badge>}
        {!isConnected && !isPending && <Badge tone="neutral">Not connected</Badge>}
      </div>

      <p className="mt-4 text-sm leading-6 text-ink-600">{description}</p>
      {isConnected && connection ? (
        <div className="mt-4 space-y-2 text-sm text-ink-700">
          <p>
            <span className="text-ink-500">Account:</span> {connection.external_account_name ?? connection.external_account_id}
          </p>
          <p>
            <span className="text-ink-500">Connected:</span>{" "}
            {connection.connected_at ? formatDate(connection.connected_at) : "—"}
          </p>
          <p>
            <span className="text-ink-500">Last synced:</span>{" "}
            {sync?.last_successful_sync_at ? formatDate(sync.last_successful_sync_at) : "Not synced yet"}
          </p>
          {isSyncRunning && (
            <p className="flex items-center gap-1.5 text-brand-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" /> Sync in progress…
            </p>
          )}
          {syncFailed && !isSyncRunning && (
            <p className="text-danger">
              Last sync failed{sync?.error_message ? `: ${sync.error_message}` : "."}
            </p>
          )}
          <p className="border-t border-ink-300 pt-3 text-xs text-ink-600">{dataLabel}</p>
          <div className="flex items-center gap-3 pt-2">
            <SyncNowButton enrollmentId={enrollmentId} provider={provider} />
            <DisconnectButton enrollmentId={enrollmentId} connectionId={connection.id} />
          </div>
        </div>
      ) : isPending ? (
        <p className="mt-4 text-sm text-ink-500">
          Authorization succeeded — select an ad account to finish connecting.
        </p>
      ) : (
        <div className="mt-auto">{connectForm}</div>
      )}
    </div>
  );
}

function ImportOption({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div className="border border-ink-300 p-4"><h3 className="font-medium text-ink-900">{title}</h3><p className="mt-1 min-h-10 text-sm leading-5 text-ink-600">{description}</p><div className="mt-4">{children}</div></div>;
}

function DataStatus({ label, connected, detail }: { label: string; connected: boolean; detail: string }) {
  return <div className="flex items-center justify-between border border-ink-300 px-4 py-3"><div><p className="font-medium text-ink-900">{label}</p><p className="mt-1 text-xs text-ink-600">{detail}</p></div><Badge tone={connected ? "success" : "neutral"}>{connected ? "Connected" : "Not connected"}</Badge></div>;
}
