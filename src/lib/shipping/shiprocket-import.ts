import "server-only";
import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeShippingStatus } from "./normalize-status";
import { buildOrderMatchIndex, matchOrderReference } from "./matching";
import type { ShiprocketShipment } from "@/lib/connections/shiprocket";
import type { CanonicalShippingStatus } from "@/types/database";

export interface ShiprocketImportResult {
  rowCount: number;
  matchedCount: number;
  unmatchedCount: number;
  statusBreakdown: Record<CanonicalShippingStatus, number>;
}

export async function importShiprocketShipments(
  supabase: SupabaseClient,
  enrollmentId: string,
  shipments: ShiprocketShipment[]
): Promise<ShiprocketImportResult> {
  const statusBreakdown: Record<CanonicalShippingStatus, number> = { shipped: 0, delivered: 0, NDR: 0, RTO: 0, unknown: 0, needs_review: 0 };
  const matchIndex = await buildOrderMatchIndex(supabase, enrollmentId);
  let matchedCount = 0;
  // API syncs are snapshots, not file uploads: each explicit manual sync is
  // a new observation even when Shiprocket returns the same shipment set.
  const fileHash = crypto.createHash("sha256").update(`${new Date().toISOString()}:${JSON.stringify(shipments)}`).digest("hex");
  const { data: importRow, error } = await supabase
    .from("mentorship_shipping_imports")
    .insert({
      enrollment_id: enrollmentId,
      filename: `shiprocket-sync-${new Date().toISOString()}.json`,
      file_hash: fileHash,
      order_column: "channel_order_id/order_id",
      status_column: "status",
      source: "shiprocket_api",
      status: "processing",
      row_count: shipments.length,
    })
    .select("id")
    .single();
  if (error || !importRow) throw new Error("Could not save the Shiprocket sync.");

  const rows = shipments.map((shipment) => {
    const normalized = normalizeShippingStatus(shipment.status);
    const match = matchOrderReference(shipment.orderReference, matchIndex);
    if (match.orderId) matchedCount += 1;
    statusBreakdown[normalized] += 1;
    return {
      import_id: importRow.id,
      enrollment_id: enrollmentId,
      external_order_reference: shipment.orderReference,
      status: normalized,
      normalized_order_id: match.orderId,
      match_method: match.method,
      // Keep only the identifiers and state required for matching/audit. A
      // Shiprocket response can contain customer details that this product
      // does not need to retain.
      raw_data: { order_reference: shipment.orderReference, provider_status: shipment.status, shipment_id: shipment.shipmentId, awb: shipment.awb },
    };
  });
  if (rows.length) {
    const { error: rowsError } = await supabase.from("mentorship_shipping_rows").insert(rows);
    if (rowsError) throw new Error("Could not save Shiprocket shipment records.");
  }
  const unmatchedCount = shipments.length - matchedCount;
  await supabase
    .from("mentorship_shipping_imports")
    .update({ status: "completed", matched_count: matchedCount, unmatched_count: unmatchedCount, completed_at: new Date().toISOString(), metadata: { statusBreakdown } })
    .eq("id", importRow.id);
  return { rowCount: shipments.length, matchedCount, unmatchedCount, statusBreakdown };
}
