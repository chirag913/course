"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { mapShopifyProduct } from "@/app/dashboard/mentorship/[slug]/products/actions";

export interface MappableShopifyProduct {
  id: string;
  title: string;
  variants: { id: string; title: string | null; sku: string | null }[];
}

export function MapShopifyForm({
  enrollmentId,
  productCatalogId,
  products,
}: {
  enrollmentId: string;
  productCatalogId: string;
  products: MappableShopifyProduct[];
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [variantId, setVariantId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const selectedProduct = useMemo(() => products.find((p) => p.id === productId), [products, productId]);

  if (products.length === 0) {
    return (
      <p className="text-sm text-ink-500">
        No Shopify products available to map — either nothing has synced yet, or every synced product is already
        mapped to a product.
      </p>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await mapShopifyProduct(enrollmentId, productCatalogId, productId, variantId || null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the mapping.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-start gap-2">
      <select
        value={productId}
        onChange={(e) => {
          setProductId(e.target.value);
          setVariantId("");
        }}
        className="h-10 rounded-md border border-ink-300 bg-ink-100 px-3 text-sm text-ink-900"
      >
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
      <select
        value={variantId}
        onChange={(e) => setVariantId(e.target.value)}
        className="h-10 rounded-md border border-ink-300 bg-ink-100 px-3 text-sm text-ink-900"
      >
        <option value="">All variants (whole product)</option>
        {(selectedProduct?.variants ?? []).map((v) => (
          <option key={v.id} value={v.id}>
            {v.title ?? v.sku ?? "Variant"}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" loading={isPending}>
        Map Shopify
      </Button>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </form>
  );
}
