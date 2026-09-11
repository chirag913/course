import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { ConnectShopifyForm } from "@/components/connections/connect-shopify-form";
import { ConnectMetaButton } from "@/components/connections/connect-meta-button";
import { DisconnectButton } from "@/components/connections/disconnect-button";
import { SyncNowButton } from "@/components/connections/sync-now-button";
import type { MentorshipConnection, MentorshipConnectionProvider, MentorshipDataSync } from "@/types/database";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ connected?: string }>;
}

const PROVIDER_LABEL: Record<MentorshipConnectionProvider, string> = {
  shopify: "Shopify",
  meta: "Meta Ads",
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

  const { data: syncRows } = await supabase
    .from("mentorship_data_syncs")
    .select("*")
    .eq("enrollment_id", enrollment.id)
    .order("created_at", { ascending: false });

  const latestSyncByProvider = new Map<MentorshipConnectionProvider, MentorshipDataSync>();
  for (const s of (syncRows ?? []) as MentorshipDataSync[]) {
    if (!latestSyncByProvider.has(s.provider)) latestSyncByProvider.set(s.provider, s);
  }

  return (
    <div>
      <Link
        href={`/dashboard/mentorship/${slug}`}
        className="mb-6 inline-flex items-center text-sm text-ink-500 hover:text-ink-900"
      >
        <ArrowLeft className="mr-1 h-3.5 w-3.5" />
        Back to dashboard
      </Link>

      <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">Connections</h1>
      <p className="mt-1 text-sm text-ink-500">
        Connect your store and ad account so your mentor can see real data — read-only, nothing here can change your
        store or ads.
      </p>

      {connected && (
        <p className="mt-4 rounded-md border border-success/40 bg-success/10 px-4 py-2 text-sm text-success">
          {PROVIDER_LABEL[connected as MentorshipConnectionProvider] ?? connected} connected successfully.
        </p>
      )}

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <ConnectionCard
          provider="shopify"
          connection={shopify}
          sync={latestSyncByProvider.get("shopify")}
          enrollmentId={enrollment.id}
          connectForm={<ConnectShopifyForm enrollmentId={enrollment.id} />}
        />
        <ConnectionCard
          provider="meta"
          connection={meta}
          sync={latestSyncByProvider.get("meta")}
          enrollmentId={enrollment.id}
          connectForm={<ConnectMetaButton enrollmentId={enrollment.id} />}
        />
      </div>
    </div>
  );
}

function ConnectionCard({
  provider,
  connection,
  sync,
  enrollmentId,
  connectForm,
}: {
  provider: MentorshipConnectionProvider;
  connection: MentorshipConnection | undefined;
  sync: MentorshipDataSync | undefined;
  enrollmentId: string;
  connectForm: React.ReactNode;
}) {
  const label = PROVIDER_LABEL[provider];
  const isConnected = connection?.status === "connected";
  const isPending = connection?.status === "pending_selection";
  const isSyncRunning = sync?.status === "running";
  const syncFailed = sync?.status === "failed";

  return (
    <div className="border border-ink-300 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink-900">{label}</h2>
        {isConnected && <Badge tone="success">Connected</Badge>}
        {isPending && <Badge tone="warning">Pending selection</Badge>}
        {!isConnected && !isPending && <Badge tone="neutral">Not connected</Badge>}
      </div>

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
            <span className="text-ink-500">Last successful sync:</span>{" "}
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
        <div className="mt-4">{connectForm}</div>
      )}
    </div>
  );
}
