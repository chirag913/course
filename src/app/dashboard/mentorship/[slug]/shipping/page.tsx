import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ShippingCsvUploadForm } from "@/components/shipping/shipping-csv-upload-form";
import { UnmatchedOrdersClassifier } from "@/components/shipping/unmatched-orders-classifier";
import { getUnmatchedShopifyOrders } from "@/lib/shipping/classification";
import type { MentorshipShippingImport } from "@/types/database";

interface Props {
  params: Promise<{ slug: string }>;
}

const IMPORT_STATUS_TONE: Record<string, "success" | "warning" | "neutral"> = {
  completed: "success",
  failed: "warning",
  processing: "neutral",
};

export default async function ShippingPage({ params }: Props) {
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

  const [{ data: importRows }, unmatchedOrders] = await Promise.all([
    supabase
      .from("mentorship_shipping_imports")
      .select("*")
      .eq("enrollment_id", enrollment.id)
      .order("imported_at", { ascending: false }),
    getUnmatchedShopifyOrders(supabase, enrollment.id),
  ]);

  const imports = (importRows ?? []) as MentorshipShippingImport[];

  return (
    <div>
      <Link href={`/dashboard/mentorship/${slug}/products`} className="mb-6 inline-flex items-center text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="mr-1 h-3.5 w-3.5" />
        Back to products
      </Link>

      <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">Fulfillment Data</h1>
      <p className="mt-1 text-sm text-ink-500">
        Upload your courier/shipping report so we can calculate real delivery, NDR, and RTO numbers per product.
      </p>

      <section className="mt-6 border border-ink-300 p-5">
        <ShippingCsvUploadForm enrollmentId={enrollment.id} />
      </section>

      <section className="mt-6 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Import history</h2>
        {imports.length === 0 ? (
          <p className="mt-2 text-sm text-ink-500">No shipping reports uploaded yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {imports.map((imp) => (
              <div key={imp.id} className="flex items-center justify-between rounded-md border border-ink-300 p-3">
                <div>
                  <p className="font-medium text-ink-900">{imp.filename}</p>
                  <p className="font-mono text-xs text-ink-500">
                    {formatDate(imp.imported_at)} · {imp.row_count} rows · {imp.matched_count} matched · {imp.unmatched_count} unmatched
                  </p>
                  {imp.error_message && <p className="mt-1 text-sm text-danger">{imp.error_message}</p>}
                </div>
                <Badge tone={IMPORT_STATUS_TONE[imp.status] ?? "neutral"}>{imp.status.toUpperCase()}</Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 border border-ink-300 p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Unresolved orders</h2>
        <p className="mt-1 text-sm text-ink-500">
          Shopify orders that never appeared in any shipping report — never assumed to be RTO, delivered, or cancelled.
        </p>
        <div className="mt-3">
          <UnmatchedOrdersClassifier enrollmentId={enrollment.id} orders={unmatchedOrders} />
        </div>
      </section>
    </div>
  );
}
