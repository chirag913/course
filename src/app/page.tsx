import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPrice, formatDuration } from "@/lib/utils";
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
    .order("published_at", { ascending: false });

  const [featured, ...otherCourses] = (courses ?? []) as Course[];

  let lessonCount = 0;
  let totalDuration = 0;
  if (featured) {
    const { data: curriculum } = await supabase
      .from("public_curriculum")
      .select("duration_seconds")
      .eq("course_id", featured.id);
    lessonCount = curriculum?.length ?? 0;
    totalDuration = (curriculum ?? []).reduce((sum, l) => sum + l.duration_seconds, 0);
  }

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
            {featured && (
              <Link href={`/courses/${featured.slug}`}>
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

      {/* Featured course */}
      <main className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        {featured ? (
          <section>
            <p className="eyebrow">Featured Course</p>
            <div className="mt-6 grid gap-10 border-t border-ink-300 pt-8 lg:grid-cols-[1fr_1.2fr] lg:items-center">
              <Link
                href={`/courses/${featured.slug}`}
                className="group relative block aspect-video w-full overflow-hidden rounded-md border border-ink-300 bg-ink-100"
              >
                {featured.thumbnail_url && (
                  <Image
                    src={featured.thumbnail_url}
                    alt={featured.title}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    priority
                  />
                )}
              </Link>
              <div>
                <span className="font-mono text-xs text-ink-500">01</span>
                <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
                  {featured.title}
                </h2>
                {featured.subtitle && <p className="mt-3 text-ink-500">{featured.subtitle}</p>}

                {featured.what_you_will_learn.length > 0 && (
                  <ul className="mt-5 space-y-1.5">
                    {featured.what_you_will_learn.slice(0, 4).map((point, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-ink-700">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-400" />
                        {point}
                      </li>
                    ))}
                  </ul>
                )}

                <p className="mt-5 font-mono text-xs uppercase tracking-wide text-ink-500">
                  {lessonCount} Lessons · {formatDuration(totalDuration)} · Lifetime Access
                </p>

                <div className="mt-6 flex items-center gap-5">
                  <span className="font-display text-2xl font-bold text-ink-900">
                    {formatPrice(featured.price, featured.currency)}
                  </span>
                  <Link href={`/courses/${featured.slug}`}>
                    <Button>
                      Get Instant Access <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <EmptyState
            icon={BookOpen}
            title="Nothing here yet."
            description="Courses will appear here as soon as they're published."
          />
        )}

        {otherCourses.length > 0 && (
          <section className="mt-20">
            <p className="eyebrow">More Courses</p>
            <div className="mt-6 divide-y divide-ink-300 border-t border-ink-300">
              {otherCourses.map((course, i) => (
                <Link
                  key={course.id}
                  href={`/courses/${course.slug}`}
                  className="group flex items-center justify-between gap-6 py-5"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="font-mono text-xs text-ink-500">{String(i + 2).padStart(2, "0")}</span>
                    <div className="min-w-0">
                      <h3 className="truncate font-display font-semibold text-ink-900">{course.title}</h3>
                      {course.subtitle && (
                        <p className="truncate text-sm text-ink-500">{course.subtitle}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span className="font-mono text-sm text-brand-300">
                      {formatPrice(course.price, course.currency)}
                    </span>
                    <ArrowRight className="h-4 w-4 text-ink-500 transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
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
      {featured && (
        <section className="border-t border-ink-300">
          <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
            <h2 className="font-display text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
              Ready to stop guessing?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-ink-500">
              Structure, not scattered information. Start with {featured.title}.
            </p>
            <Link href={`/courses/${featured.slug}`}>
              <Button size="lg" className="mt-6">
                Explore Courses <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>
      )}

      <SiteFooter />
    </div>
  );
}
