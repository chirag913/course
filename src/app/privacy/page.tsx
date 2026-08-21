import type { Metadata } from "next";
import { LegalPageLayout, LegalSection } from "@/components/legal-page";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How " + siteConfig.platformName + " collects, uses, and protects your data.",
};

const LAST_UPDATED = "22 August 2026";

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <LegalSection number="01" title="Introduction">
        <p>
          This policy explains what information {siteConfig.platformName} (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;) collects when you use the Platform, why we collect it, and how it&apos;s
          handled. It only describes what this Platform actually collects — not a generic
          template.
        </p>
      </LegalSection>

      <LegalSection number="02" title="Information We Collect">
        <p>When you create an account and use the Platform, we collect:</p>
        <ul>
          <li>
            <strong>Account information</strong> — your name and email address, used to create
            and manage your account
          </li>
          <li>
            <strong>Course enrollment data</strong> — which courses you&apos;ve purchased and when
          </li>
          <li>
            <strong>Order information</strong> — purchase amount, currency, order status, and the
            payment identifiers Razorpay returns to us. We do not collect or store your card, UPI,
            or bank account details — those are handled entirely by Razorpay
          </li>
          <li>
            <strong>Learning progress</strong> — which lessons you&apos;ve completed and your
            approximate position in a lesson&apos;s video, so you can resume where you left off
          </li>
        </ul>
        <p>
          We do not currently collect a phone number, physical address, or any government ID.
          Our hosting and infrastructure providers (Vercel and Supabase) may automatically log
          standard technical information — such as IP address and browser type — as part of
          normal server operation; we don&apos;t separately collect or analyze this ourselves.
        </p>
      </LegalSection>

      <LegalSection number="03" title="Why We Collect It">
        <p>We collect this information to:</p>
        <ul>
          <li>Create and secure your account</li>
          <li>Verify your payment and grant you access to the course(s) you purchased</li>
          <li>Let you track and resume your learning progress</li>
          <li>Respond to support requests</li>
          <li>Meet our legal and accounting obligations</li>
        </ul>
      </LegalSection>

      <LegalSection number="04" title="Payment Processing">
        <p>
          All payments are processed by Razorpay, a third-party payment gateway. When you check
          out, you provide your payment details directly to Razorpay, not to us. We receive only
          the order status and payment reference identifiers needed to confirm your purchase and
          grant access.
        </p>
      </LegalSection>

      <LegalSection number="05" title="Third-Party Service Providers">
        <p>We rely on the following service providers to operate the Platform:</p>
        <ul>
          <li>
            <strong>Supabase</strong> — database, authentication, and file storage for course
            materials
          </li>
          <li>
            <strong>Razorpay</strong> — payment processing
          </li>
          <li>
            <strong>Vercel</strong> — application hosting
          </li>
          <li>
            <strong>YouTube</strong> — course videos are hosted as unlisted YouTube videos and
            embedded in the course player; viewing a video loads an embed from YouTube
          </li>
        </ul>
        <p>Each provider only receives the information necessary to perform its function.</p>
      </LegalSection>

      <LegalSection number="06" title="Security">
        <p>
          Access to your account and course content is protected by authentication, and database
          access is restricted by row-level security policies so that students can only see their
          own data and admins can only be granted access deliberately. Course materials are served
          through short-lived signed download links rather than public files.
        </p>
      </LegalSection>

      <LegalSection number="07" title="Data Retention">
        <p>
          We retain your account, enrollment, and order information for as long as your account is
          active, and as needed to meet legal, accounting, and dispute-resolution requirements
          after that.
        </p>
      </LegalSection>

      <LegalSection number="08" title="Your Rights">
        <p>
          You can request access to, correction of, or deletion of your personal information by
          contacting us. Note that we may need to retain certain order records even after account
          deletion, to meet legal and accounting obligations.
        </p>
      </LegalSection>

      <LegalSection number="09" title="Cookies">
        <p>
          We use essential cookies to keep you signed in and to remember your session — the
          Platform won&apos;t function correctly without them. We do not currently use third-party
          advertising or analytics cookies.
        </p>
      </LegalSection>

      <LegalSection number="10" title="Changes to This Policy">
        <p>
          We may update this policy as the Platform evolves. Material changes will be reflected by
          updating the &ldquo;Last updated&rdquo; date at the top of this page.
        </p>
      </LegalSection>

      <LegalSection number="11" title="Contact">
        <p>
          Questions about this policy or your data can be sent to{" "}
          {siteConfig.supportEmail.startsWith("[") ? (
            siteConfig.supportEmail
          ) : (
            <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>
          )}
          .
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
