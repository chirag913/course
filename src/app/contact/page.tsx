import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Mail } from "lucide-react";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch for course access, payments, refunds, or technical support.",
};

const SUPPORT_TOPICS = [
  "Course access issues",
  "Payment or checkout problems",
  "Refund requests",
  "Account issues",
  "Technical problems with video or downloads",
];

export default function ContactPage() {
  const emailConfigured = !siteConfig.supportEmail.startsWith("[");

  return (
    <div className="min-h-screen bg-ink-50">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="eyebrow">Contact</p>
        <h1 className="mt-3 font-display text-4xl font-bold leading-[1.05] tracking-tightest text-ink-900 sm:text-5xl">
          Get in touch.
        </h1>
        <p className="mt-4 max-w-lg text-lg text-ink-500">
          For anything related to your course, your account, or a purchase — reach out directly
          and I&apos;ll get back to you.
        </p>

        <div className="mt-10 border border-ink-300 p-6 sm:p-8">
          <p className="font-mono text-[11px] uppercase tracking-wide text-ink-500">
            {siteConfig.legalEntityName}
          </p>
          {emailConfigured ? (
            <a
              href={`mailto:${siteConfig.supportEmail}`}
              className="mt-2 inline-flex items-center gap-2 font-display text-2xl font-bold text-ink-900 hover:text-brand-300"
            >
              <Mail className="h-5 w-5" />
              {siteConfig.supportEmail}
            </a>
          ) : (
            <p className="mt-2 font-display text-xl font-bold text-danger">
              {siteConfig.supportEmail}
            </p>
          )}
          <p className="mt-4 text-sm text-ink-500">We aim to respond within 2–3 business days.</p>
        </div>

        <div className="mt-10 border-t border-ink-300 pt-8">
          <p className="eyebrow">Contact us for</p>
          <ul className="mt-4 space-y-2.5">
            {SUPPORT_TOPICS.map((topic) => (
              <li key={topic} className="flex items-start gap-2.5 text-sm text-ink-700">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-400" />
                {topic}
              </li>
            ))}
          </ul>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
