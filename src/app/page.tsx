import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPrice } from "@/lib/utils";
import { ArrowRight, BookOpen, Youtube, Instagram, Star } from "lucide-react";
import type { Course } from "@/types/database";

type HomeCourse = Course & { display_order?: number | null };

type HomeStat = {
  value: string;
  label: string;
};

type HomeTestimonial = {
  name: string;
  role: string;
  rating: number;
  quote: string;
};

function isMissingDisplayOrderColumn(error: { code?: string | null } | null | undefined) {
  return error?.code === "42703";
}

const CREDIBILITY_STATS: HomeStat[] = [
  { value: "₹30Cr+", label: "Revenue Generated" },
  { value: "8+ Years", label: "Building Businesses" },
  { value: "60K+", label: "YouTube Community" },
  { value: "2 Markets", label: "India + International" },
];

const HERO_PANEL_STATS: HomeStat[] = [
  { value: "₹30Cr+", label: "Revenue generated" },
  { value: "8+", label: "Years building" },
  { value: "60K+", label: "YouTube community" },
  { value: "India × Global", label: "Market reach" },
];

const TESTIMONIALS: HomeTestimonial[] = [
  {
    name: "Nikhil",
    role: "Brand Founder",
    rating: 5,
    quote:
      "I started from zero and scaled to ₹3Cr in 12 months. I started with dropshipping and eventually built my own brand with Chirag’s mentorship.",
  },
  {
    name: "Shreya",
    role: "D2C Founder",
    rating: 5,
    quote:
      "Every time I tried scaling, my ad costs would shoot up. Chirag helped me structure the business properly, and I was finally able to scale sustainably.",
  },
  {
    name: "Rohan",
    role: "Agency Owner",
    rating: 5,
    quote:
      "I had no idea what to sell or how to start my US agency. Chirag helped me build it from the ground up. Four months later, I’m consistently doing $10K/month.",
  },
];

export default async function HomePage() {
  const supabase = await createClient();
  const { data: orderedCourses, error: orderedCoursesError } = await supabase
    .from("courses")
    .select("*")
    .eq("status", "published")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });
  let courses: HomeCourse[];
  if (orderedCoursesError && !isMissingDisplayOrderColumn(orderedCoursesError)) {
    throw orderedCoursesError;
  }

  if (!orderedCoursesError) {
    courses = orderedCourses ?? [];
  } else {
    const { data: fallbackCourses, error: fallbackCoursesError } = await supabase
      .from("courses")
      .select("*")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .order("created_at", { ascending: false });
    if (fallbackCoursesError) throw fallbackCoursesError;
    courses = fallbackCourses ?? [];
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <SiteHeader />

      {/* Hero */}
      <section className="border-b border-ink-300">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="grid gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-start">
            <div>
              <p className="eyebrow">Chirag Sharma</p>
              <h1 className="mt-4 font-display text-5xl font-bold leading-[0.95] tracking-tightest text-ink-900 sm:text-7xl">
                Learn.
                <br />
                Build.
                <br />
                Scale.
              </h1>
              <p className="mt-6 max-w-xl text-lg text-ink-500">
                Practical playbooks for building, acquiring customers, and scaling businesses — taught from
                8+ years of actually doing it.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <a href="#courses">
                  <Button size="lg">Explore Courses</Button>
                </a>
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
              <p className="mt-4 text-sm text-ink-500">₹30Cr+ generated · 8+ years building · 60K+ audience</p>
            </div>

            <aside className="hidden border border-ink-300 bg-ink-100/80 px-5 py-5 lg:block lg:p-6">
              <p className="eyebrow">Building in public</p>
              <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-5">
                {HERO_PANEL_STATS.map((stat) => (
                  <div key={`${stat.label}-${stat.value}`} className="space-y-1">
                    <p className="font-display text-2xl font-semibold text-ink-900 sm:text-3xl">{stat.value}</p>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-400">{stat.label}</p>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* Credibility */}
      <section className="border-b border-ink-300">
        <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-y divide-ink-300 px-4 py-10 sm:grid-cols-4 sm:divide-y-0 sm:px-6">
          {CREDIBILITY_STATS.map((stat) => (
            <div key={stat.label} className="px-4 py-6 sm:px-6">
              <p className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">{stat.value}</p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-ink-500">{stat.label}</p>
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
              {courses.map((course) => (
                <Link
                  key={course.id}
                  href={`/courses/${course.slug}`}
                  className="group block border border-ink-300 bg-ink-50 transition-colors hover:bg-ink-100"
                >
                  <div className="relative aspect-video w-full overflow-hidden border-b border-ink-300 bg-ink-100">
                    {course.thumbnail_url ? (
                      <Image
                        src={course.thumbnail_url}
                        alt={course.title}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        priority={course.display_order === 1}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-ink-500">No thumbnail</div>
                    )}
                  </div>
                  <div className="p-4 sm:p-5">
                    <p className="font-display text-2xl font-bold leading-tight text-ink-900 sm:text-3xl">{course.title}</p>
                    {course.subtitle && <p className="mt-2 line-clamp-2 text-sm text-ink-500">{course.subtitle}</p>}
                    <div className="mt-4 flex items-center justify-between gap-4 border-t border-dotted border-ink-200 pt-4">
                      <span className="font-display text-lg font-bold text-ink-900">
                        {formatPrice(course.price, course.currency)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 transition-colors group-hover:text-ink-900">
                        Open course <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={BookOpen}
              title="Nothing here yet."
              description="Courses will appear here as soon as they are published."
              action={null}
            />
          )}
        </section>
      </main>

      {/* Student outcomes */}
      <section className="border-t border-b border-ink-300 bg-ink-100/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <p className="eyebrow">WHAT STUDENTS ARE BUILDING</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
            Real businesses. Real outcomes.
          </h2>
          <p className="mt-2 max-w-xl text-ink-500">Built through implementation, not theory.</p>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TESTIMONIALS.map((testimonial) => (
              <article key={testimonial.name} className="border border-ink-300 bg-ink-50 p-5">
                <div className="flex items-center gap-0.5" aria-label={`${testimonial.rating} star rating`}>
                  {Array.from({ length: testimonial.rating }).map((_, idx) => (
                    <Star key={`${testimonial.name}-${idx}`} className="h-3.5 w-3.5 fill-brand-400 text-brand-400" />
                  ))}
                </div>
                <p className="mt-4 text-sm text-ink-700">“{testimonial.quote}”</p>
                <p className="mt-5 font-display text-base font-semibold text-ink-900">{testimonial.name}</p>
                <p className="font-mono text-[11px] uppercase tracking-wide text-ink-500">{testimonial.role}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      <section className="border-b border-ink-300">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[auto_1fr]">
            <p className="eyebrow shrink-0">THE PERSON BEHIND THE PLAYBOOK</p>
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-bold tracking-tight text-ink-900">I&apos;m Chirag.</h2>
              <p className="mt-4 text-ink-600">
                I started dropshipping at 18 — no money, no mentor, no idea what a &ldquo;winning product&rdquo; even meant.
                Since then I&apos;ve run stores across the Indian and international markets, generating ₹30Cr+ in
                combined revenue, and documented most of it publicly on YouTube to 60,000+ subscribers.
              </p>
              <p className="mt-4 text-ink-600">
                These courses are the structured version of what actually worked — and what didn&apos;t.
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
      <section className="border-b border-ink-300">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <p className="eyebrow">LEARN FOR FREE</p>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
            Not ready for a course? Start here.
          </h2>
          <p className="mt-3 max-w-lg text-ink-500">Years of experiments, case studies, mistakes and lessons — published publicly.</p>
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
      <section className="border-b border-ink-300">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
          <h2 className="font-display text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
            Ready to stop guessing?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-500">
            Learn from systems built through years of testing, failing and scaling — not theory.
          </p>
          <a href="#courses">
            <Button size="lg" className="mt-6">
              Explore Courses
              <ArrowRight className="h-4 w-4" />
            </Button>
          </a>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
