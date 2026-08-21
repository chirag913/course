import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export function LegalPageLayout({
  title,
  lastUpdated,
  intro,
  children,
}: {
  title: string;
  lastUpdated: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-ink-50">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="eyebrow">Legal</p>
        <h1 className="mt-3 font-display text-4xl font-bold leading-[1.05] tracking-tightest text-ink-900 sm:text-5xl">
          {title}
        </h1>
        <p className="mt-3 font-mono text-xs text-ink-500">Last updated: {lastUpdated}</p>
        {intro && <p className="mt-6 max-w-xl text-ink-500">{intro}</p>}
        <div className="mt-12 divide-y divide-ink-300 border-t border-ink-300">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}

export function LegalSection({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="py-8">
      <h2 className="font-mono text-xs font-medium tracking-wide text-brand-400">
        {number} — {title.toUpperCase()}
      </h2>
      <div className="prose-content mt-3 max-w-none">{children}</div>
    </section>
  );
}
