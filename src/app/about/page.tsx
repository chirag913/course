import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ArrowRight, Youtube, Instagram } from "lucide-react";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "About",
  description: "About Chirag Sharma — practical courses based on real-world business experience.",
};

const STATS = [
  { value: "₹30Cr+", label: "Revenue Generated" },
  { value: "8+ Years", label: "Operating" },
  { value: "60K+", label: "YouTube Subscribers" },
  { value: "2 Markets", label: "India + International" },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-ink-50">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="eyebrow">About</p>
        <h1 className="mt-3 font-display text-4xl font-bold leading-[1.05] tracking-tightest text-ink-900 sm:text-5xl">
          I&apos;m Chirag.
        </h1>

        <div className="prose-content mt-8 max-w-none">
          <p>
            I started dropshipping at 18 — no money, no mentor, no idea what a &ldquo;winning
            product&rdquo; even meant. Since then I&apos;ve run stores across the Indian and
            international markets: banned ad accounts, dead stock, suppliers who ghosted
            mid-order — all of it.
          </p>
          <p>
            Over 8+ years I&apos;ve generated ₹30Cr+ in combined revenue across those stores, and
            documented most of it publicly on YouTube to 60,000+ subscribers — real numbers, real
            ad accounts, real mistakes, no paywall.
          </p>
          <p>
            <strong>{siteConfig.platformName}</strong> is the structured version of what actually
            worked, and what didn&apos;t. Practical courses based on real-world experience
            building and operating businesses — not theory recorded once and left online.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-2 divide-x divide-y divide-ink-300 border border-ink-300 sm:grid-cols-4 sm:divide-y-0">
          {STATS.map((stat) => (
            <div key={stat.label} className="p-5">
              <p className="font-display text-xl font-bold text-ink-900">{stat.value}</p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-ink-500">
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-ink-300 pt-8">
          <a
            href={siteConfig.mainSiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-brand-300 hover:underline"
          >
            chiragsharma.co
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </a>
          <a
            href={siteConfig.youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 transition-colors hover:text-ink-900"
          >
            <Youtube className="h-4 w-4" /> YouTube
          </a>
          <a
            href={siteConfig.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 transition-colors hover:text-ink-900"
          >
            <Instagram className="h-4 w-4" /> Instagram
          </a>
          <Link
            href="/"
            className="ml-auto text-sm font-medium text-ink-600 transition-colors hover:text-ink-900"
          >
            Browse courses →
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
