"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { saveProductEconomics } from "@/app/dashboard/mentorship/[slug]/products/actions";
import type { MentorshipProductEconomics, SellingPriceSource } from "@/types/database";

// ₹ minor-unit <-> rupee-string helpers for this form only — the rest of
// the app stores/passes minor units everywhere; only the input boxes deal
// in whole-currency display.
function minorToDisplay(minor: number | null): string {
  return minor == null ? "" : (minor / 100).toString();
}
function displayToMinor(display: string): number | null {
  const trimmed = display.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

interface Props {
  enrollmentId: string;
  productCatalogId: string;
  existing: MentorshipProductEconomics | null;
  shopifySuggestedPriceMinor: number | null;
  shopifyPriceAmbiguous: boolean;
}

const FIELDS: { key: keyof FieldState; label: string }[] = [
  { key: "cogs", label: "COGS (per unit)" },
  { key: "shipping", label: "Shipping Cost (per order)" },
  { key: "cod", label: "COD Fee (per order)" },
  { key: "packaging", label: "Packaging (per order)" },
  { key: "other", label: "Other Variable Cost (per order)" },
  { key: "rto", label: "RTO Cost (per RTO'd order)" },
];

interface FieldState {
  cogs: string;
  shipping: string;
  cod: string;
  packaging: string;
  other: string;
  rto: string;
}

export function EconomicsForm({ enrollmentId, productCatalogId, existing, shopifySuggestedPriceMinor, shopifyPriceAmbiguous }: Props) {
  const [sellingPrice, setSellingPrice] = useState(
    minorToDisplay(existing?.selling_price_minor ?? shopifySuggestedPriceMinor ?? null)
  );
  const [sellingPriceSource, setSellingPriceSource] = useState<SellingPriceSource | null>(
    existing?.selling_price_source ?? (shopifySuggestedPriceMinor != null ? "shopify" : null)
  );
  const [fields, setFields] = useState<FieldState>({
    cogs: minorToDisplay(existing?.cogs_minor ?? null),
    shipping: minorToDisplay(existing?.shipping_cost_minor ?? null),
    cod: minorToDisplay(existing?.cod_fee_minor ?? null),
    packaging: minorToDisplay(existing?.packaging_cost_minor ?? null),
    other: minorToDisplay(existing?.other_variable_cost_minor ?? null),
    rto: minorToDisplay(existing?.rto_cost_minor ?? null),
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function updateField(key: keyof FieldState, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function useShopifyPrice() {
    if (shopifySuggestedPriceMinor == null) return;
    setSellingPrice(minorToDisplay(shopifySuggestedPriceMinor));
    setSellingPriceSource("shopify");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const values = {
      sellingPriceMinor: displayToMinor(sellingPrice),
      cogsMinor: displayToMinor(fields.cogs),
      shippingCostMinor: displayToMinor(fields.shipping),
      codFeeMinor: displayToMinor(fields.cod),
      packagingCostMinor: displayToMinor(fields.packaging),
      otherVariableCostMinor: displayToMinor(fields.other),
      rtoCostMinor: displayToMinor(fields.rto),
    };
    for (const [key, v] of Object.entries(values)) {
      if (v != null && v < 0) {
        setError(`${key} cannot be negative.`);
        return;
      }
    }

    startTransition(async () => {
      try {
        await saveProductEconomics(enrollmentId, productCatalogId, {
          ...values,
          sellingPriceSource: values.sellingPriceMinor == null ? null : sellingPriceSource,
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save economics.");
      }
    });
  }

  const showShopifySuggestion =
    !shopifyPriceAmbiguous && shopifySuggestedPriceMinor != null && minorToDisplay(shopifySuggestedPriceMinor) !== sellingPrice;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Selling Price (₹)</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            min={0}
            step="0.01"
            value={sellingPrice}
            onChange={(e) => {
              setSellingPrice(e.target.value);
              setSellingPriceSource("manual");
            }}
            className="max-w-[160px]"
            placeholder="Not set"
          />
          {sellingPriceSource && <span className="font-mono text-xs text-ink-500">source: {sellingPriceSource}</span>}
          {showShopifySuggestion && (
            <button type="button" onClick={useShopifyPrice} className="text-xs text-brand-300 underline">
              Use Shopify price (₹{(shopifySuggestedPriceMinor! / 100).toFixed(2)})
            </button>
          )}
        </div>
        {shopifyPriceAmbiguous && (
          <p className="mt-1 text-xs text-danger">
            This product has multiple different variant prices in Shopify — a single price can&apos;t be inferred automatically. Enter it manually.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map(({ key, label }) => (
          <div key={key}>
            <Label>{label} (₹)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={fields[key]}
              onChange={(e) => updateField(key, e.target.value)}
              placeholder="Not set"
            />
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" loading={isPending}>
        Save Economics
      </Button>
    </form>
  );
}
