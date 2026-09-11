import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CheckoutBox } from "@/components/checkout/checkout-box";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type { Program } from "@/types/database";

interface Props {
  params: Promise<{ slug: string }>;
}

async function getMentorshipProgram(slug: string): Promise<Program | null> {
  const supabase = await createClient();
  const { data: program } = await supabase
    .from("programs")
    .select("*")
    .eq("slug", slug)
    .eq("type_id", "mentorship")
    .eq("status", "published")
    .maybeSingle<Program>();

  return program;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const program = await getMentorshipProgram(slug);
  if (!program) return {};
  return {
    title: program.title,
    description: program.subtitle ?? undefined,
  };
}

export default async function MentorshipSalesPage({ params }: Props) {
  const { slug } = await params;
  const program = await getMentorshipProgram(slug);
  if (!program) notFound();

  const user = await getCurrentUser();

  let isEnrolled = false;
  if (user) {
    const supabase = await createClient();
    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("id")
      .eq("user_id", user.id)
      .eq("program_id", program.id)
      .maybeSingle();
    isEnrolled = !!enrollment;
  }

  return (
    <div id="top" className="min-h-screen scroll-smooth bg-ink-50">
      <SiteHeader />

      <section className="border-b border-ink-300">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_1fr] lg:py-20">
          <div>
            <p className="eyebrow">Mentorship</p>
            <h1 className="mt-3 font-display text-4xl font-bold leading-[1.05] tracking-tightest text-ink-900 sm:text-5xl">
              {program.title}
            </h1>
            {program.subtitle && <p className="mt-4 max-w-xl text-lg text-ink-500">{program.subtitle}</p>}

            <div className="relative mt-8 aspect-video w-full overflow-hidden rounded-md border border-ink-300 bg-ink-100">
              {program.thumbnail_url ? (
                <Image src={program.thumbnail_url} alt={program.title} fill className="object-cover" priority />
              ) : null}
            </div>
          </div>

          <div className="lg:sticky lg:top-24 lg:self-start">
            <CheckoutBox program={program} isSignedIn={!!user} isEnrolled={isEnrolled} salesPath="/mentorship" />
          </div>
        </div>
      </section>

      {program.description && (
        <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <section className="max-w-2xl">
            <p className="eyebrow">About this program</p>
            <div
              className="prose-content mt-5 border-t border-ink-300 pt-5"
              dangerouslySetInnerHTML={{ __html: program.description }}
            />
          </section>
        </main>
      )}

      {!isEnrolled && (
        <section className="border-t border-ink-300">
          <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
            <h2 className="font-display text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
              {program.title}
            </h2>
            <p className="mt-3 font-display text-2xl font-bold text-ink-900">
              {formatPrice(program.price, program.currency)}
            </p>
            <a href="#top">
              <Button size="lg" className="mt-6">
                Get Instant Access <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
          </div>
        </section>
      )}

      <SiteFooter />
    </div>
  );
}
