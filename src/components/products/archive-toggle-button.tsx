"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setProductStatus } from "@/app/dashboard/mentorship/[slug]/products/actions";
import type { ProductCatalogStatus } from "@/types/database";

export function ArchiveToggleButton({
  enrollmentId,
  productId,
  status,
}: {
  enrollmentId: string;
  productId: string;
  status: ProductCatalogStatus;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const nextStatus: ProductCatalogStatus = status === "active" ? "archived" : "active";

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        await setProductStatus(enrollmentId, productId, nextStatus);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update the product.");
      }
    });
  }

  return (
    <span>
      <Button variant="outline" size="sm" onClick={handleClick} loading={isPending}>
        {status === "active" ? "Archive" : "Reactivate"}
      </Button>
      {error && <span className="ml-2 text-sm text-danger">{error}</span>}
    </span>
  );
}
