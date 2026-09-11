"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { removeShopifyMapping, removeMetaMapping } from "@/app/dashboard/mentorship/[slug]/products/actions";

export function RemoveMappingButton({
  enrollmentId,
  productCatalogId,
  linkId,
  provider,
}: {
  enrollmentId: string;
  productCatalogId: string;
  linkId: string;
  provider: "shopify" | "meta";
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      try {
        if (provider === "shopify") await removeShopifyMapping(enrollmentId, linkId, productCatalogId);
        else await removeMetaMapping(enrollmentId, linkId, productCatalogId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not remove the mapping.");
      }
    });
  }

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        Remove
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-sm text-ink-700">Remove this mapping?</span>
      <Button variant="danger" size="sm" onClick={handleRemove} loading={isPending}>
        Yes, remove
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
      {error && <span className="text-sm text-danger">{error}</span>}
    </span>
  );
}
