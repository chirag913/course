"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { parseCsv, guessOrderColumn, guessStatusColumn } from "@/lib/shipping/csv";
import { uploadShippingCsv } from "@/app/dashboard/mentorship/[slug]/shipping/actions";
import type { CanonicalShippingStatus } from "@/types/database";

interface UploadResult {
  rowCount: number;
  matchedCount: number;
  unmatchedCount: number;
  statusBreakdown: Record<CanonicalShippingStatus, number>;
}

export function ShippingCsvUploadForm({ enrollmentId, source = "manual_csv", label = "Upload Shipping CSV" }: { enrollmentId: string; source?: "shiprocket_csv" | "manual_csv"; label?: string }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [orderColumn, setOrderColumn] = useState("");
  const [statusColumn, setStatusColumn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const parsed = parseCsv(text);
      if (parsed.headers.length === 0) {
        setError("Could not detect any columns in this file. Make sure it's a valid CSV with a header row.");
        return;
      }
      setFileName(file.name);
      setCsvText(text);
      setHeaders(parsed.headers);
      setOrderColumn(guessOrderColumn(parsed.headers) ?? parsed.headers[0] ?? "");
      setStatusColumn(guessStatusColumn(parsed.headers) ?? parsed.headers[0] ?? "");
    };
    reader.onerror = () => setError("Could not read this file.");
    reader.readAsText(file);
    e.target.value = ""; // allow re-selecting the same file later
  }

  function handleImport() {
    if (!csvText || !fileName) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await uploadShippingCsv(enrollmentId, { filename: fileName, csvText, orderColumn, statusColumn, source });
        setResult(res);
        setCsvText(null);
        setHeaders([]);
        setFileName(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not import this file.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="inline-flex cursor-pointer items-center rounded-md border border-ink-300 px-4 py-2 text-sm font-medium text-ink-800 hover:bg-ink-200">
          {label}
          <input type="file" accept=".csv,text/csv" onChange={handleFileChange} className="hidden" />
        </label>
      </div>

      {headers.length > 0 && (
        <div className="space-y-3 rounded-md border border-ink-300 p-4">
          <p className="text-sm text-ink-700">
            Detected columns in <strong>{fileName}</strong>. Confirm which ones to use before importing:
          </p>
          <div className="flex flex-wrap gap-4">
            <label className="text-sm text-ink-700">
              <span className="mb-1 block font-medium">Order reference column</span>
              <select
                value={orderColumn}
                onChange={(e) => setOrderColumn(e.target.value)}
                className="h-10 rounded-md border border-ink-300 bg-ink-100 px-3 text-sm text-ink-900"
              >
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-ink-700">
              <span className="mb-1 block font-medium">Status column</span>
              <select
                value={statusColumn}
                onChange={(e) => setStatusColumn(e.target.value)}
                className="h-10 rounded-md border border-ink-300 bg-ink-100 px-3 text-sm text-ink-900"
              >
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button onClick={handleImport} loading={isPending}>
            Import
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {result && (
        <div className="rounded-md border border-success/40 bg-success/10 p-4 text-sm text-ink-800">
          <p className="font-medium">
            Imported: {result.rowCount} rows · Matched: {result.matchedCount} · Unmatched: {result.unmatchedCount}
          </p>
          <p className="mt-2 font-mono text-xs text-ink-700">
            Delivered {result.statusBreakdown.delivered} · Shipped {result.statusBreakdown.shipped} · NDR {result.statusBreakdown.NDR} · RTO{" "}
            {result.statusBreakdown.RTO} · Unknown {result.statusBreakdown.unknown + result.statusBreakdown.needs_review}
          </p>
        </div>
      )}
    </div>
  );
}
