import "server-only";
import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCsv } from "./csv";
import { normalizeShippingStatus } from "./normalize-status";
import { buildOrderMatchIndex, matchOrderReference } from "./matching";
import type { CanonicalShippingStatus } from "@/types/database";

export class ShippingImportError extends Error {}

export interface ImportShippingCsvParams {
  enrollmentId: string;
  filename: string;
  csvText: string;
  orderColumn: string;
  statusColumn: string;
  source?: "shiprocket_csv" | "manual_csv";
}

export interface ImportShippingCsvResult {
  importId: string;
  rowCount: number;
  matchedCount: number;
  unmatchedCount: number;
  statusBreakdown: Record<CanonicalShippingStatus, number>;
}

const CHUNK_SIZE = 500;

// The whole pipeline: hash -> duplicate check -> parse -> create the import
// row -> normalize + match every row -> bulk insert -> finalize. Runs
// entirely through whatever Supabase client the caller passes (the
// RLS-scoped client from the Server Action that already verified
// ownership) — there's nothing secret in a shipping report, unlike Phase
// A's OAuth tokens, so no service-role client is needed here.
export async function importShippingCsv(
  supabase: SupabaseClient,
  params: ImportShippingCsvParams
): Promise<ImportShippingCsvResult> {
  const fileHash = crypto.createHash("sha256").update(params.csvText).digest("hex");

  // Idempotency: re-uploading the exact same file is rejected up front,
  // before any parsing/matching work happens — see Part S.
  const { data: existingImport } = await supabase
    .from("mentorship_shipping_imports")
    .select("id")
    .eq("enrollment_id", params.enrollmentId)
    .eq("file_hash", fileHash)
    .maybeSingle();
  if (existingImport) {
    throw new ShippingImportError("This exact file has already been imported. Upload a different or updated report instead.");
  }

  const { headers, rows } = parseCsv(params.csvText);
  if (!headers.includes(params.orderColumn) || !headers.includes(params.statusColumn)) {
    throw new ShippingImportError("The selected columns were not found in this file's header row.");
  }
  if (rows.length === 0) {
    throw new ShippingImportError("This file has no data rows to import.");
  }

  const { data: importRow, error: importError } = await supabase
    .from("mentorship_shipping_imports")
    .insert({
      enrollment_id: params.enrollmentId,
      filename: params.filename,
      file_hash: fileHash,
      order_column: params.orderColumn,
      status_column: params.statusColumn,
      source: params.source ?? "manual_csv",
      status: "processing",
      row_count: rows.length,
    })
    .select("id")
    .single();
  if (importError || !importRow) {
    if (importError?.code === "23505") {
      throw new ShippingImportError("This exact file has already been imported.");
    }
    throw new ShippingImportError("Could not start the import.");
  }
  const importId = importRow.id as string;

  const matchIndex = await buildOrderMatchIndex(supabase, params.enrollmentId);

  let matchedCount = 0;
  let unmatchedCount = 0;
  const statusBreakdown: Record<CanonicalShippingStatus, number> = {
    shipped: 0,
    delivered: 0,
    NDR: 0,
    RTO: 0,
    unknown: 0,
    needs_review: 0,
  };

  const rowsToInsert = rows.map((row) => {
    const reference = row[params.orderColumn] ?? "";
    const rawStatus = row[params.statusColumn] ?? "";
    const normalizedStatus = normalizeShippingStatus(rawStatus);
    const match = matchOrderReference(reference, matchIndex);
    if (match.orderId) matchedCount += 1;
    else unmatchedCount += 1;
    statusBreakdown[normalizedStatus] += 1;
    return {
      import_id: importId,
      enrollment_id: params.enrollmentId,
      external_order_reference: reference,
      status: normalizedStatus,
      normalized_order_id: match.orderId,
      match_method: match.method,
      raw_data: row,
    };
  });

  for (let i = 0; i < rowsToInsert.length; i += CHUNK_SIZE) {
    const chunk = rowsToInsert.slice(i, i + CHUNK_SIZE);
    const { error: rowsError } = await supabase.from("mentorship_shipping_rows").insert(chunk);
    if (rowsError) {
      await supabase
        .from("mentorship_shipping_imports")
        .update({ status: "failed", error_message: "Could not save all rows from this file.", completed_at: new Date().toISOString() })
        .eq("id", importId);
      throw new ShippingImportError("Could not save all rows from this file.");
    }
  }

  await supabase
    .from("mentorship_shipping_imports")
    .update({
      status: "completed",
      matched_count: matchedCount,
      unmatched_count: unmatchedCount,
      completed_at: new Date().toISOString(),
      metadata: { statusBreakdown },
    })
    .eq("id", importId);

  return { importId, rowCount: rows.length, matchedCount, unmatchedCount, statusBreakdown };
}
