"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { syncAllProviders } from "@/app/dashboard/mentorship/[slug]/connections/actions";

export function SyncAllButton({ enrollmentId }: { enrollmentId: string }) {
  const router = useRouter();
  const [result, setResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return <div><Button variant="outline" onClick={() => startTransition(async () => { try { const summary = await syncAllProviders(enrollmentId); setResult(summary.join(" · ")); router.refresh(); } catch { setResult("Sync needs attention. Try an individual provider."); } })} loading={isPending}>Sync all</Button>{result && <p className="mt-2 text-xs text-ink-600">{result}</p>}</div>;
}
