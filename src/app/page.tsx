import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPrice } from "@/lib/utils";
import { ArrowRight, BookOpen, Youtube, Instagram } from "lucide-react";
import type { Course } from "@/types/database";

const STATS = [
  { value: "₹30Cr+", label: "Revenue Generated" },
  { value: "8+ Years", label: "Operating" },
  { value: "60K+", label: "YouTube Subscribers" },
  { value: "2 Markets", label: "India + International" },
];

export default async function HomePage() {
  const supabase = await createClient();
  const { data: courses } = await supabase
    .from("courses")
    .select("*")
    .eq("status", "published")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-ink-50">
      <SiteHeader />

      {/* Hero */}
      <section className="border-b border-ink-300">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <p className="eyebrow">Chirag Sharma</p>
          <h1 className="mt-4 font-display text-5xl font-bold leading-[0.95] tracking-tightest text-ink-900 sm:text-7xl">
            Learn.
            <br />
            Build.
            <br />
            Scale.
          </h1>
          <p className="mt-6 max-w-lg text-lg text-ink-500">
            Practical courses built from 8+ years actually building, testing, and scaling
            businesses — not theory recorded once and left online.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            {(courses ?? []).length > 0 && (
              <Link href="#courses">
                <Button size="lg">
                  Explore Courses <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            )}
            <a
              href="https://www.youtube.com/chiragsharma"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 transition-colors hover:text-ink-900"
            >
              Watch free on YouTube
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </a>
          </div>
        </div>
      </section>

      {/* Credibility */}
      <section className="border-b border-ink-300">
        <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-y divide-ink-300 px-4 sm:grid-cols-4 sm:divide-y-0 sm:px-6">
          {STATS.map((stat) => (
            <div key={stat.label} className="px-4 py-8 sm:px-6">
              <p className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">{stat.value}</p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-ink-500">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Courses */}
      <main className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <section id="courses">
          <p className="eyebrow">COURSES</p>
          {(courses ?? []).length > 0 ? (
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              {(courses as Course[]).map((course) => (
                <Link
                  key={course.id}
                  href={`/courses/${course.slug}`}
                  className="group block border border-ink-300 p-4 transition-colors hover:bg-ink-100 sm:p-5"
                >
                  <div className="relative aspect-video w-full overflow-hidden rounded-md border border-ink-300 bg-ink-100">
                    {course.thumbnail_url && (
                      <Image
                        src={course.thumbnail_url}
                        alt={course.title}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        priority={course.display_order === 1}
                      />
                    )}
                  </div>

                  <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
                    {course.title}
                  </h2>
                  {course.subtitle && <p className="mt-2 text-sm text-ink-500">{course.subtitle}</p>}

                  <div className="mt-4 flex items-center justify-between">
                    <span className="font-display text-lg font-bold text-ink-900">
                      {formatPrice(course.price, course.currency)}
                    </span>
                    <ArrowRight className="h-4 w-4 text-brand-300 transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={BookOpen}
              title="Nothing here yet."
              description="Courses will appear here as soon as they're published."
              action={null}
            />
          )}
        </section>
      </main>

      {/* About */}
      <section className="border-t border-ink-300">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[auto_1fr]">
            <p className="eyebrow shrink-0">About</p>
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-bold tracking-tight text-ink-900">I&apos;m Chirag.</h2>
              <p className="mt-4 text-ink-600">
                I started dropshipping at 18 — no money, no mentor, no idea what a &ldquo;winning
                product&rdquo; even meant. Since then I&apos;ve run stores across the Indian and
                international markets, generating ₹30Cr+ in combined revenue, and documented most
                of it publicly on YouTube to 60,000+ subscribers.
              </p>
              <p className="mt-4 text-ink-600">
                These courses are the structured version of what actually worked — and what
                didn&apos;t.
              </p>
              <a
                href="https://chiragsharma.co"
                target="_blank"
                rel="noopener noreferrer"
                className="group mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand-300 hover:underline"
              >
                More about Chirag
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Free content */}
      <section className="border-t border-ink-300">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <p className="eyebrow">Start For Free</p>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
            Prefer to test the waters first?
          </h2>
          <p className="mt-3 max-w-lg text-ink-500">
            I&apos;ve spent years posting real numbers, real ad accounts, and real mistakes — no
            paywall.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <a href="https://www.youtube.com/chiragsharma" target="_blank" rel="noopener noreferrer">
              <Button variant="outline">
                <Youtube className="h-4 w-4" /> Watch on YouTube
              </Button>
            </a>
            <a
              href="https://www.instagram.com/thechirag13/"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 transition-colors hover:text-ink-900"
            >
              <Instagram className="h-4 w-4" /> @thechirag13
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </a>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-ink-300">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
          <h2 className="font-display text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
            Ready to stop guessing?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-ink-500">
            Structure, not scattered information. Start with the latest course from this list.
          </p>
          <Link href="#courses">
            <Button size="lg" className="mt-6">
              Explore Courses <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
