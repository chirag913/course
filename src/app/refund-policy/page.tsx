import type { Metadata } from "next";
import { LegalPageLayout, LegalSection } from "@/components/legal-page";
import { siteConfig, REFUND_WINDOW_TEXT } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy",
  description: "Refund and cancellation policy for courses purchased on " + siteConfig.platformName,
};

const LAST_UPDATED = "22 August 2026";

export default function RefundPolicyPage() {
  return (
    <LegalPageLayout title="Refund & Cancellation Policy" lastUpdated={LAST_UPDATED}>
      <LegalSection number="01" title="Refund Eligibility">
        <p>
          If you&apos;re not satisfied with a course, you may request a refund within{" "}
          <strong>{REFUND_WINDOW_TEXT}</strong> of your purchase, provided you have not completed
          a substantial portion of the course content. This window is displayed here and, where
          applicable, at checkout — the two will always match.
        </p>
      </LegalSection>

      <LegalSection number="02" title="How to Request a Refund">
        <p>
          Email {siteConfig.supportEmail.startsWith("[") ? siteConfig.supportEmail : (
            <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>
          )}{" "}
          with your registered email address and the course name. Include your order reference if
          you have it — this speeds things up but isn&apos;t required.
        </p>
      </LegalSection>

      <LegalSection number="03" title="How Approved Refunds Are Processed">
        <p>
          Approved refunds are issued to your original payment method via Razorpay. Once
          processed on our end, funds typically take 5–7 business days to reflect in your account,
          depending on your bank or payment provider.
        </p>
      </LegalSection>

      <LegalSection number="04" title="When Refunds May Not Be Available">
        <p>Refunds may be declined if:</p>
        <ul>
          <li>The request is made after the refund window above has passed</li>
          <li>A substantial portion of the course has already been completed</li>
          <li>There&apos;s evidence of account sharing, content redistribution, or other misuse in violation of our Terms & Conditions</li>
        </ul>
      </LegalSection>

      <LegalSection number="05" title="Payment Succeeded but Access Wasn't Granted">
        <p>
          Course access is granted automatically once Razorpay confirms a successful payment. If a
          payment was deducted from your account but you don&apos;t see the course in your
          dashboard within a few minutes, please contact us with your payment reference — we&apos;ll
          verify the payment and grant access, or issue a refund if the payment genuinely
          didn&apos;t go through on our end.
        </p>
      </LegalSection>

      <LegalSection number="06" title="Duplicate Payments">
        <p>
          If you&apos;re accidentally charged twice for the same course, contact us with both
          payment references. We&apos;ll verify and refund the duplicate charge in full.
        </p>
      </LegalSection>

      <LegalSection number="07" title="Cancellations">
        <p>
          Because courses are delivered digitally and access is typically granted immediately
          after payment, there is no separate &ldquo;cancellation&rdquo; step before delivery —
          the process above for refund requests applies instead.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
