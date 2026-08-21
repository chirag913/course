import Link from "next/link";
import { siteConfig } from "@/lib/site-config";

const PLATFORM_LINKS = [
  { href: "/", label: "Courses" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refund-policy", label: "Refund & Cancellation" },
  { href: "/shipping-policy", label: "Shipping Policy" },
];

const SOCIAL_LINKS = [
  { href: siteConfig.mainSiteUrl, label: "chiragsharma.co" },
  { href: siteConfig.youtubeUrl, label: "YouTube" },
  { href: siteConfig.instagramUrl, label: "Instagram" },
];

function FooterColumn({ links }: { links: { href: string; label: string }[] }) {
  return (
    <ul className="space-y-2.5">
      {links.map((link) => (
        <li key={link.label}>
          <Link
            href={link.href}
            target={link.href.startsWith("http") ? "_blank" : undefined}
            rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
            className="text-sm text-ink-500 transition-colors hover:text-ink-900"
          >
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-ink-300">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <p className="font-display text-lg font-bold tracking-tight text-ink-900">
              Chirag Sharma<span className="text-brand-400">.</span>
            </p>
            <p className="mt-3 max-w-[220px] text-sm text-ink-500">
              Practical courses based on real-world experience building and operating businesses.
            </p>
          </div>
          <FooterColumn links={PLATFORM_LINKS} />
          <FooterColumn links={LEGAL_LINKS} />
          <FooterColumn links={SOCIAL_LINKS} />
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-ink-300 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ink-500">
            © {new Date().getFullYear()} {siteConfig.legalEntityName}. All rights reserved.
          </p>
          <p className="text-xs text-ink-500">Payments secured by Razorpay</p>
        </div>
      </div>
    </footer>
  );
}
