import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";
import { CheckoutBox } from "@/components/checkout/checkout-box";
import { CheckCircle2, PlayCircle, FileText, Star } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import type {
  Course,
  CourseSection,
  Faq,
  PublicCurriculumRow,
  Testimonial,
} from "@/types/database";

interface Props {
  params: Promise<{ slug: string }>;
}

async function getCourseData(slug: string) {
  const supabase = await createClient();

  const { data: course } = await supabase
    .from("courses")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (!course) return null;

  const [{ data: sections }, { data: curriculum }, { data: testimonials }, { data: faqs }] =
    await Promise.all([
      supabase
        .from("course_sections")
        .select("*")
        .eq("course_id", course.id)
        .order("position"),
      supabase
        .from("public_curriculum")
        .select("*")
        .eq("course_id", course.id)
        .order("position"),
      supabase
        .from("testimonials")
        .select("*")
        .eq("course_id", course.id)
        .eq("is_published", true)
        .order("position"),
      supabase
        .from("faqs")
        .select("*")
        .eq("course_id", course.id)
        .eq("is_published", true)
        .order("position"),
    ]);

  return {
    course: course as Course,
    sections: (sections ?? []) as CourseSection[],
    curriculum: (curriculum ?? []) as PublicCurriculumRow[],
    testimonials: (testimonials ?? []) as Testimonial[],
    faqs: (faqs ?? []) as Faq[],
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCourseData(slug);
  if (!data) return {};
  return {
    title: data.course.title,
    description: data.course.subtitle ?? data.course.description ?? undefined,
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default async function CourseSalesPage({ params }: Props) {
  const { slug } = await params;
  const data = await getCourseData(slug);
  if (!data) notFound();

  const { course, sections, curriculum, testimonials, faqs } = data;
  const user = await getCurrentUser();

  let isEnrolled = false;
  if (user) {
    const supabase = await createClient();
    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("id")
      .eq("user_id", user.id)
      .eq("course_id", course.id)
      .maybeSingle();
    isEnrolled = !!enrollment;
  }

  const totalLessons = curriculum.length;
  const totalDuration = curriculum.reduce((sum, l) => sum + l.duration_seconds, 0);
  const lessonsBySection = new Map<string, PublicCurriculumRow[]>();
  for (const lesson of curriculum) {
    const list = lessonsBySection.get(lesson.course_section_id) ?? [];
    list.push(lesson);
    lessonsBySection.set(lesson.course_section_id, list);
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <SiteHeader />

      {/* Hero */}
      <section className="border-b border-ink-300">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_1fr] lg:py-20">
          <div>
            {course.instructor_name && <p className="eyebrow">By {course.instructor_name}</p>}
            <h1 className="mt-3 font-display text-4xl font-bold leading-[1.05] tracking-tightest text-ink-900 sm:text-5xl">
              {course.title}
            </h1>
            {course.subtitle && <p className="mt-4 max-w-xl text-lg text-ink-500">{course.subtitle}</p>}

            <div className="relative mt-8 aspect-video w-full overflow-hidden rounded-md border border-ink-300 bg-ink-100">
              {course.thumbnail_url ? (
                <Image src={course.thumbnail_url} alt={course.title} fill className="object-cover" priority />
              ) : null}
            </div>
          </div>

          <div className="lg:sticky lg:top-24 lg:self-start">
            <CheckoutBox course={course} isSignedIn={!!user} isEnrolled={isEnrolled} />
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-16 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-16">
            {course.what_you_will_learn.length > 0 && (
              <section>
                <p className="eyebrow">What you&apos;ll learn</p>
                <ul className="mt-5 grid gap-3 border-t border-ink-300 pt-5 sm:grid-cols-2">
                  {course.what_you_will_learn.map((point, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-ink-700">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      {point}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {course.description && (
              <section>
                <p className="eyebrow">About this course</p>
                <div
                  className="prose-content mt-5 border-t border-ink-300 pt-5"
                  dangerouslySetInnerHTML={{ __html: course.description }}
                />
              </section>
            )}

            <section>
              <p className="eyebrow">Course curriculum</p>
              <p className="mt-2 font-mono text-xs text-ink-500">
                {sections.length} SECTIONS · {totalLessons} LESSONS · {formatDuration(totalDuration).toUpperCase()} TOTAL
              </p>
              <div className="mt-5 divide-y divide-ink-300 border-t border-ink-300">
                {sections.map((section, sIdx) => {
                  const lessons = lessonsBySection.get(section.id) ?? [];
                  return (
                    <div key={section.id} className="py-5">
                      <h3 className="font-mono text-xs font-medium tracking-wide text-ink-500">
                        {pad(sIdx + 1)} — {section.title.toUpperCase()}
                      </h3>
                      <ul className="mt-3 space-y-2.5">
                        {lessons.map((lesson, lIdx) => (
                          <li key={lesson.id} className="flex items-center justify-between gap-4 text-sm">
                            <div className="flex min-w-0 items-center gap-2.5 text-ink-700">
                              <span className="font-mono text-xs text-ink-500">{pad(lIdx + 1)}</span>
                              {lesson.lesson_type === "video" ? (
                                <PlayCircle className="h-3.5 w-3.5 shrink-0 text-ink-500" />
                              ) : (
                                <FileText className="h-3.5 w-3.5 shrink-0 text-ink-500" />
                              )}
                              {lesson.is_free_preview ? (
                                <Link
                                  href={`/courses/${course.slug}/preview/${lesson.id}`}
                                  className="truncate font-medium text-brand-300 hover:underline"
                                >
                                  {lesson.title}
                                </Link>
                              ) : (
                                <span className="truncate">{lesson.title}</span>
                              )}
                              {lesson.is_free_preview && (
                                <span className="shrink-0 rounded-full border border-brand-400/50 px-2 py-0.5 font-mono text-[10px] uppercase text-brand-300">
                                  Preview
                                </span>
                              )}
                            </div>
                            {lesson.duration_seconds > 0 && (
                              <span className="shrink-0 font-mono text-xs text-ink-500">
                                {formatDuration(lesson.duration_seconds)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>

            {testimonials.length > 0 && (
              <section>
                <p className="eyebrow">What students say</p>
                <div className="mt-5 grid gap-px border-t border-ink-300 pt-5 sm:grid-cols-2 sm:gap-8">
                  {testimonials.map((t) => (
                    <div key={t.id} className="border-t border-ink-300 pt-5 first:border-t-0 first:pt-0 sm:border-t-0 sm:pt-0">
                      <div className="flex gap-0.5">
                        {Array.from({ length: t.rating }).map((_, i) => (
                          <Star key={i} className="h-3.5 w-3.5 fill-brand-400 text-brand-400" />
                        ))}
                      </div>
                      <p className="mt-3 text-sm text-ink-700">&ldquo;{t.content}&rdquo;</p>
                      <p className="mt-3 font-mono text-xs text-ink-500">{t.student_name.toUpperCase()}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {faqs.length > 0 && (
              <section>
                <p className="eyebrow">Frequently asked questions</p>
                <div className="mt-5 divide-y divide-ink-300 border-t border-ink-300">
                  {faqs.map((faq) => (
                    <details key={faq.id} className="group py-4">
                      <summary className="cursor-pointer list-none text-sm font-medium text-ink-900">
                        {faq.question}
                      </summary>
                      <p className="mt-2 text-sm text-ink-500">{faq.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}
          </div>

          <div className="space-y-10">
            {course.instructor_name && (
              <div>
                <p className="eyebrow">Instructor</p>
                <div className="mt-4 flex items-center gap-3 border-t border-ink-300 pt-4">
                  {course.instructor_avatar_url ? (
                    <Image
                      src={course.instructor_avatar_url}
                      alt={course.instructor_name}
                      width={48}
                      height={48}
                      className="rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full border border-ink-300" />
                  )}
                  <p className="font-display font-semibold text-ink-900">{course.instructor_name}</p>
                </div>
                {course.instructor_bio && (
                  <p className="mt-3 text-sm text-ink-500">{course.instructor_bio}</p>
                )}
              </div>
            )}

            <div>
              <p className="eyebrow">Course information</p>
              <dl className="mt-4 space-y-2.5 border-t border-ink-300 pt-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-500">Sections</dt>
                  <dd className="font-mono text-ink-900">{sections.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">Lessons</dt>
                  <dd className="font-mono text-ink-900">{totalLessons}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">Total duration</dt>
                  <dd className="font-mono text-ink-900">{formatDuration(totalDuration)}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
