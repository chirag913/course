"use client";

import { useEffect, useState } from "react";
import { Drawer } from "./drawer";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { MentorOverrideForm } from "@/components/products/mentor-override-form";
import { formatDate } from "@/lib/utils";
import { getProductDetailForMentor, type ProductDetailForMentor } from "@/app/admin/mentorship/[programId]/students/[enrollmentId]/product-detail-actions";
import type { DateRangePreset } from "@/lib/products/date-range";
import type { ProductDecisionState } from "@/types/database";

const DECISION_TONE: Record<ProductDecisionState, "success" | "warning" | "neutral" | "brand"> = {
  SCALE: "success",
  RELAUNCH: "brand",
  ITERATE: "warning",
  WATCH: "neutral",
  TEST: "neutral",
  DATA_NEEDED: "warning",
  KILL: "warning",
};

function money(minor: number | null | undefined): string {
  return minor != null ? `₹${(minor / 100).toFixed(2)}` : "—";
}

export function ProductDetailDrawer({
  enrollmentId,
  productId,
  rangePreset,
  customStart,
  customEnd,
  onClose,
}: {
  enrollmentId: string;
  productId: string;
  rangePreset: DateRangePreset;
  customStart?: string;
  customEnd?: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ProductDetailForMentor | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getProductDetailForMentor(enrollmentId, productId, rangePreset, customStart, customEnd).then((result) => {
      if (!cancelled) setDetail(result);
    });
    return () => {
      cancelled = true;
    };
  }, [enrollmentId, productId, rangePreset, customStart, customEnd]);

  return (
    <Drawer title={detail ? detail.product.name : "Product"} onClose={onClose}>
      {detail === undefined ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : detail === null ? (
        <p className="text-sm text-danger">Could not load this product.</p>
      ) : (
        <div className="space-y-6">
          <div>
            <p className="font-mono text-[11px] uppercase text-ink-500">Decision</p>
            <div className="mt-1 flex items-center gap-2">
              {detail.effectiveDecision.effectiveDecision ? (
                <Badge tone={DECISION_TONE[detail.effectiveDecision.effectiveDecision]}>
                  {detail.effectiveDecision.effectiveDecision.replace("_", " ")}
                </Badge>
              ) : (
                <Badge>Not evaluated</Badge>
              )}
              {detail.effectiveDecision.isOverridden && <span className="text-xs text-brand-300">(mentor override)</span>}
            </div>
            {detail.decisionHistory[0] && (
              <p className="mt-1 text-sm text-ink-700">{detail.decisionHistory[0].why}</p>
            )}
            {detail.effectiveDecision.activeOverride && (
              <p className="mt-1 text-sm text-ink-700">
                Override reason: &quot;{detail.effectiveDecision.activeOverride.override_reason}&quot;
              </p>
            )}
            <div className="mt-3">
              <MentorOverrideForm enrollmentId={enrollmentId} productCatalogId={productId} />
            </div>
          </div>

          <div className="border-t border-ink-300 pt-4">
            <p className="font-mono text-[11px] uppercase text-ink-500">Economics</p>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <div><dt className="text-ink-500">Selling price</dt><dd className="text-ink-900">{money(detail.economics?.selling_price_minor)}</dd></div>
              <div><dt className="text-ink-500">COGS</dt><dd className="text-ink-900">{money(detail.economics?.cogs_minor)}</dd></div>
              <div><dt className="text-ink-500">Shipping</dt><dd className="text-ink-900">{money(detail.economics?.shipping_cost_minor)}</dd></div>
              <div><dt className="text-ink-500">COD fee</dt><dd className="text-ink-900">{money(detail.economics?.cod_fee_minor)}</dd></div>
              <div><dt className="text-ink-500">Packaging</dt><dd className="text-ink-900">{money(detail.economics?.packaging_cost_minor)}</dd></div>
              <div><dt className="text-ink-500">RTO cost</dt><dd className="text-ink-900">{money(detail.economics?.rto_cost_minor)}</dd></div>
              <div><dt className="text-ink-500">Contribution</dt><dd className="text-ink-900">{money(detail.contributionProfit)}</dd></div>
              <div><dt className="text-ink-500">Break-even ROAS</dt><dd className="text-ink-900">{detail.breakEvenRoas != null ? `${detail.breakEvenRoas.toFixed(2)}x` : "—"}</dd></div>
            </dl>
          </div>

          <div className="border-t border-ink-300 pt-4">
            <p className="font-mono text-[11px] uppercase text-ink-500">Shopify</p>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <div><dt className="text-ink-500">Revenue</dt><dd className="text-ink-900">{money(detail.metrics.shopify.revenue)}</dd></div>
              <div><dt className="text-ink-500">Orders</dt><dd className="text-ink-900">{detail.metrics.shopify.ordersCount}</dd></div>
              <div><dt className="text-ink-500">Units</dt><dd className="text-ink-900">{detail.metrics.shopify.unitsSold}</dd></div>
            </dl>
          </div>

          <div className="border-t border-ink-300 pt-4">
            <p className="font-mono text-[11px] uppercase text-ink-500">Meta</p>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <div><dt className="text-ink-500">Spend</dt><dd className="text-ink-900">{money(detail.metrics.meta.spend)}</dd></div>
              <div><dt className="text-ink-500">CTR</dt><dd className="text-ink-900">{detail.metrics.meta.ctr != null ? `${detail.metrics.meta.ctr.toFixed(2)}%` : "—"}</dd></div>
              <div><dt className="text-ink-500">CPC</dt><dd className="text-ink-900">{money(detail.metrics.meta.cpc)}</dd></div>
              <div><dt className="text-ink-500">Purchases</dt><dd className="text-ink-900">{detail.metrics.meta.purchases ?? "—"}</dd></div>
              <div><dt className="text-ink-500">Meta ROAS</dt><dd className="text-ink-900">{detail.metaRoas != null ? `${detail.metaRoas.toFixed(2)}x` : "—"}</dd></div>
              <div><dt className="text-ink-500">Blended ROAS</dt><dd className="text-ink-900">{detail.blendedRoas != null ? `${detail.blendedRoas.toFixed(2)}x` : "—"}</dd></div>
            </dl>
          </div>

          <div className="border-t border-ink-300 pt-4">
            <p className="font-mono text-[11px] uppercase text-ink-500">Fulfillment</p>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <div><dt className="text-ink-500">Shipped</dt><dd className="text-ink-900">{detail.fulfillment.counts.shipped}</dd></div>
              <div><dt className="text-ink-500">Delivered</dt><dd className="text-ink-900">{detail.fulfillment.counts.delivered}</dd></div>
              <div><dt className="text-ink-500">NDR</dt><dd className="text-ink-900">{detail.fulfillment.counts.ndr}</dd></div>
              <div><dt className="text-ink-500">RTO</dt><dd className="text-ink-900">{detail.fulfillment.counts.rto}</dd></div>
              <div><dt className="text-ink-500">RTO rate</dt><dd className="text-ink-900">{detail.fulfillment.rates.rtoRate != null ? `${detail.fulfillment.rates.rtoRate.toFixed(1)}%` : "—"}</dd></div>
            </dl>
          </div>

          {detail.decisionHistory.length > 1 && (
            <div className="border-t border-ink-300 pt-4">
              <p className="font-mono text-[11px] uppercase text-ink-500">Decision history</p>
              <ul className="mt-2 space-y-1 text-sm text-ink-700">
                {detail.decisionHistory.slice(0, 10).map((d) => (
                  <li key={d.id}>
                    {d.decision.replace("_", " ")} · {formatDate(d.created_at)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
