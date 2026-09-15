"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { importShopifyOrdersCsv } from "@/app/dashboard/mentorship/[slug]/connections/actions";

export function ShopifyCsvUploadForm({ enrollmentId }: { enrollmentId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return <div className="space-y-2"><label className="inline-flex cursor-pointer items-center rounded-md border border-ink-300 px-3 py-2 text-sm font-medium text-ink-800 hover:bg-ink-200">Select Shopify orders CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>{file && <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-ink-600">{file.name}</span><Button size="sm" loading={isPending} onClick={() => startTransition(async () => { try { const csvText = await file.text(); const imported = await importShopifyOrdersCsv(enrollmentId, file.name, csvText); setResult(`${imported.ordersImported} orders and ${imported.lineItemsImported} line items imported.`); setFile(null); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not import this file."); } })}>Upload and import</Button></div>}{result && <p className="text-xs text-success">{result}</p>}{error && <p className="text-xs text-danger">{error}</p>}</div>;
}
