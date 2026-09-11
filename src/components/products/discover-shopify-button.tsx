"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { discoverShopifyProducts } from "@/app/dashboard/mentorship/[slug]/products/actions";

export function DiscoverShopifyButton({ enrollmentId }: { enrollmentId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    setError(null);
    setSummary(null);
    startTransition(async () => {
      try {
        const result = await discoverShopifyProducts(enrollmentId);
        const parts = [
          `${result.createdCount} new product${result.createdCount === 1 ? "" : "s"} created`,
          `${result.autoLinkedCount} auto-linked to existing products`,
        ];
        if (result.suggestions.length > 0) {
          parts.push(
            `${result.suggestions.length} possible match${result.suggestions.length === 1 ? "" : "es"} need manual review: ` +
              result.suggestions.map((s) => `"${s.shopifyTitle}" -> "${s.catalogName}" (${s.confidence})`).join("; ")
          );
        }
        setSummary(parts.join(". "));
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not scan Shopify products.");
      }
    });
  }

  return (
    <div>
      <Button variant="outline" size="sm" onClick={handleClick} loading={isPending}>
        Scan Shopify for new products
      </Button>
      {summary && <p className="mt-2 max-w-2xl text-sm text-ink-700">{summary}</p>}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
