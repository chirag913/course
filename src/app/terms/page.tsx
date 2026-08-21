import type { Metadata } from "next";
import { LegalPageLayout, LegalSection } from "@/components/legal-page";
import { siteConfig, REFUND_WINDOW_TEXT } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "Terms and conditions for purchasing and accessing courses on " + siteConfig.platformName,
};

const LAST_UPDATED = "22 August 2026";

export default function TermsPage() {
  return (
    <LegalPageLayout title="Terms & Conditions" lastUpdated={LAST_UPDATED}>
      <LegalSection number="01" title="Introduction">
        <p>
          These Terms & Conditions (&ldquo;Terms&rdquo;) govern your access to and use of{" "}
          {siteConfig.platformName} (the &ldquo;Platform&rdquo;), operated by{" "}
          {siteConfig.legalEntityName} (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;). By
          creating an account or purchasing a course, you agree to these Terms. If you do not
          agree, please do not use the Platform.
        </p>
      </LegalSection>

      <LegalSection number="02" title="Eligibility">
        <p>
          You must be at least 18 years old, or the age of legal majority in your jurisdiction, to
          purchase a course. If you are under this age, a parent or guardian must create the
          account and make the purchase on your behalf.
        </p>
      </LegalSection>

      <LegalSection number="03" title="Account Registration">
        <p>
          You need an account to access purchased courses. You&apos;re responsible for keeping
          your login credentials confidential and for all activity under your account. Notify us
          immediately if you suspect unauthorized access.
        </p>
      </LegalSection>

      <LegalSection number="04" title="Course Purchases">
        <p>
          Course prices are displayed in Indian Rupees (INR) on each course&apos;s sales page.
          Payments are processed securely through Razorpay. An order is only fulfilled — meaning
          you&apos;re enrolled and granted access — after Razorpay confirms the payment was
          successful.
        </p>
      </LegalSection>

      <LegalSection number="05" title="Course Access">
        <p>
          Once enrollment is confirmed, the course becomes available in your student dashboard.
          Access is tied to your individual account and is not transferable.
        </p>
      </LegalSection>

      <LegalSection number="06" title="Lifetime Access">
        <p>
          Unless a course explicitly states otherwise, enrollment grants lifetime access to that
          course&apos;s content for as long as the Platform continues to operate. We don&apos;t
          currently apply an access expiry to purchased courses.
        </p>
      </LegalSection>

      <LegalSection number="07" title="Digital Content">
        <p>
          All courses consist of digital content — video lessons, written material, and
          downloadable resources (such as PDFs or spreadsheets) where provided. No physical
          product is shipped or provided.
        </p>
      </LegalSection>

      <LegalSection number="08" title="Personal-Use License">
        <p>
          Purchasing a course grants you a limited, non-exclusive, non-transferable license to
          access and view the content for your own personal, non-commercial, educational use.
        </p>
      </LegalSection>

      <LegalSection number="09" title="Intellectual Property">
        <p>
          All course content — video, text, graphics, and downloadable materials — is the
          intellectual property of {siteConfig.legalEntityName} and is protected by applicable
          copyright and intellectual property law. Purchasing a course does not transfer ownership
          of this content to you.
        </p>
      </LegalSection>

      <LegalSection number="10" title="Prohibited Sharing / Reselling">
        <p>You may not, under any circumstances:</p>
        <ul>
          <li>Share your account or login credentials with anyone else</li>
          <li>Download, copy, record, or redistribute course content outside the Platform</li>
          <li>Resell, sublicense, or otherwise commercially exploit any course content</li>
          <li>Upload course content to any other platform, public or private</li>
        </ul>
        <p>Violating this section may result in immediate account termination without refund.</p>
      </LegalSection>

      <LegalSection number="11" title="Account Suspension / Termination">
        <p>
          We may suspend or terminate your account if you violate these Terms, misuse the
          Platform, or engage in fraudulent payment activity. Where reasonably possible, we&apos;ll
          notify you of the reason before or at the time of suspension.
        </p>
      </LegalSection>

      <LegalSection number="12" title="Payments">
        <p>
          All payments are processed by Razorpay. We do not collect or store your card, UPI, or
          bank account details — Razorpay handles this directly in compliance with applicable
          payment security standards.
        </p>
      </LegalSection>

      <LegalSection number="13" title="Refunds">
        <p>
          Refunds are handled according to our{" "}
          <a href="/refund-policy">Refund &amp; Cancellation Policy</a>, including the applicable
          refund window ({REFUND_WINDOW_TEXT}). Please review that page for full details before
          purchasing.
        </p>
      </LegalSection>

      <LegalSection number="14" title="No Guarantee of Business or Financial Results">
        <p>
          Our courses are educational in nature and reflect real experience, but they are{" "}
          <strong>not a guarantee of any specific outcome</strong>. We do not promise or guarantee
          any level of income, profit, business success, sales, or results from applying the
          material. Your results depend on many factors outside our control, including your own
          effort, market conditions, and execution.
        </p>
      </LegalSection>

      <LegalSection number="15" title="Educational Disclaimer">
        <p>
          Course content is provided for general educational and informational purposes only. It
          does not constitute financial, legal, tax, or professional business advice. You should
          seek independent professional advice before making business or financial decisions.
        </p>
      </LegalSection>

      <LegalSection number="16" title="Limitation of Liability">
        <p>
          To the fullest extent permitted by law, {siteConfig.legalEntityName} shall not be liable
          for any indirect, incidental, or consequential damages — including loss of profit,
          revenue, or business — arising from your use of, or inability to use, the Platform or
          course content.
        </p>
      </LegalSection>

      <LegalSection number="17" title="Changes to Courses / Platform">
        <p>
          We may update, add to, or improve course content and the Platform itself over time. We
          may also update these Terms; continued use of the Platform after changes take effect
          means you accept the updated Terms.
        </p>
      </LegalSection>

      <LegalSection number="18" title="Contact Information">
        <p>
          Questions about these Terms can be sent to{" "}
          {siteConfig.supportEmail.startsWith("[") ? (
            siteConfig.supportEmail
          ) : (
            <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>
          )}
          . See our <a href="/contact">Contact page</a> for more.
        </p>
      </LegalSection>

      <LegalSection number="19" title="Governing Law & Jurisdiction">
        <p>
          These Terms are governed by the laws of India. Any disputes arising from these Terms or
          your use of the Platform shall be subject to the exclusive jurisdiction of the courts of
          {siteConfig.businessAddress ? ` ${siteConfig.businessAddress}` : " [JURISDICTION CITY TO BE CONFIRMED]"}
          .
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
