"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { mapMetaAd } from "@/app/dashboard/mentorship/[slug]/products/actions";

export interface MappableMetaAd {
  id: string;
  name: string | null;
  adSetName: string | null;
  campaignName: string | null;
}

function adLabel(ad: MappableMetaAd): string {
  const parts = [ad.campaignName, ad.adSetName, ad.name].filter(Boolean);
  return parts.length > 0 ? parts.join(" → ") : "Untitled ad";
}

export function MapMetaForm({
  enrollmentId,
  productCatalogId,
  ads,
}: {
  enrollmentId: string;
  productCatalogId: string;
  ads: MappableMetaAd[];
}) {
  const [adId, setAdId] = useState(ads[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (ads.length === 0) {
    return (
      <p className="text-sm text-ink-500">
        No Meta ads available to map — either nothing has synced yet, or every synced ad is already mapped to a
        product.
      </p>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await mapMetaAd(enrollmentId, productCatalogId, adId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the mapping.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-start gap-2">
      <select
        value={adId}
        onChange={(e) => setAdId(e.target.value)}
        className="h-10 max-w-md rounded-md border border-ink-300 bg-ink-100 px-3 text-sm text-ink-900"
      >
        {ads.map((ad) => (
          <option key={ad.id} value={ad.id}>
            {adLabel(ad)}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" loading={isPending}>
        Map ad
      </Button>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </form>
  );
}
