import type { Metadata } from "next";
import { LegalPageLayout, LegalSection } from "@/components/legal-page";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Shipping Policy",
  description: "Shipping policy for " + siteConfig.platformName + " — digital courses only, nothing physical ships.",
};

const LAST_UPDATED = "22 August 2026";

export default function ShippingPolicyPage() {
  return (
    <LegalPageLayout
      title="Shipping Policy"
      lastUpdated={LAST_UPDATED}
      intro={`All products sold through ${siteConfig.platformName} are digital educational products. No physical products are shipped.`}
    >
      <LegalSection number="01" title="No Physical Shipping">
        <p>
          Every course on this Platform is delivered entirely online. There are no physical
          goods, no courier deliveries, and no shipping charges of any kind.
        </p>
      </LegalSection>

      <LegalSection number="02" title="How Course Access Is Delivered">
        <p>
          Once your payment is confirmed by Razorpay, the course is added to your account
          automatically and appears in your student dashboard. Video lessons stream directly in
          the course player, and any downloadable materials (like PDFs or spreadsheets) are
          available for download from within the lesson.
        </p>
      </LegalSection>

      <LegalSection number="03" title="Delivery Timing">
        <p>
          Access is typically granted within moments of a successful payment. If you&apos;ve paid
          and don&apos;t see your course after a few minutes, please see our{" "}
          <a href="/refund-policy">Refund &amp; Cancellation Policy</a> or{" "}
          <a href="/contact">contact us</a> directly — we&apos;ll sort it out.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
