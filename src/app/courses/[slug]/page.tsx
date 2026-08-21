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
      <section className="border-b border-ink-100 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.4fr_1fr] lg:py-16">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
              {course.title}
            </h1>
            {course.subtitle && <p className="mt-3 text-lg text-ink-500">{course.subtitle}</p>}
            {course.instructor_name && (
              <p className="mt-4 text-sm text-ink-600">
                By <span className="font-medium text-ink-900">{course.instructor_name}</span>
              </p>
            )}

            <div className="relative mt-6 aspect-video w-full overflow-hidden rounded-2xl bg-ink-100 shadow-card">
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

      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-12">
            {course.what_you_will_learn.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold text-ink-900">What you&apos;ll learn</h2>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {course.what_you_will_learn.map((point, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-ink-700">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      {point}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {course.description && (
              <section>
                <h2 className="text-xl font-semibold text-ink-900">About this course</h2>
                <div
                  className="prose-content mt-4"
                  dangerouslySetInnerHTML={{ __html: course.description }}
                />
              </section>
            )}

            <section>
              <h2 className="text-xl font-semibold text-ink-900">Course curriculum</h2>
              <p className="mt-1 text-sm text-ink-500">
                {sections.length} sections · {totalLessons} lessons · {formatDuration(totalDuration)} total
              </p>
              <div className="mt-4 space-y-3">
                {sections.map((section) => {
                  const lessons = lessonsBySection.get(section.id) ?? [];
                  return (
                    <div key={section.id} className="overflow-hidden rounded-xl border border-ink-100 bg-white">
                      <div className="border-b border-ink-100 bg-ink-50 px-4 py-3">
                        <h3 className="text-sm font-semibold text-ink-900">{section.title}</h3>
                      </div>
                      <ul className="divide-y divide-ink-100">
                        {lessons.map((lesson) => (
                          <li key={lesson.id} className="flex items-center justify-between px-4 py-3 text-sm">
                            <div className="flex items-center gap-2 text-ink-700">
                              {lesson.lesson_type === "video" ? (
                                <PlayCircle className="h-4 w-4 text-ink-400" />
                              ) : (
                                <FileText className="h-4 w-4 text-ink-400" />
                              )}
                              {lesson.is_free_preview ? (
                                <Link
                                  href={`/courses/${course.slug}/preview/${lesson.id}`}
                                  className="font-medium text-brand-600 hover:underline"
                                >
                                  {lesson.title}
                                </Link>
                              ) : (
                                <span>{lesson.title}</span>
                              )}
                              {lesson.is_free_preview && (
                                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                                  Free Preview
                                </span>
                              )}
                            </div>
                            {lesson.duration_seconds > 0 && (
                              <span className="text-xs text-ink-400">
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
                <h2 className="text-xl font-semibold text-ink-900">What students say</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {testimonials.map((t) => (
                    <div key={t.id} className="rounded-xl border border-ink-100 bg-white p-5">
                      <div className="flex gap-0.5">
                        {Array.from({ length: t.rating }).map((_, i) => (
                          <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                        ))}
                      </div>
                      <p className="mt-3 text-sm text-ink-700">&ldquo;{t.content}&rdquo;</p>
                      <p className="mt-3 text-sm font-medium text-ink-900">{t.student_name}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {faqs.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold text-ink-900">Frequently asked questions</h2>
                <div className="mt-4 divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white">
                  {faqs.map((faq) => (
                    <details key={faq.id} className="group p-5">
                      <summary className="cursor-pointer list-none text-sm font-medium text-ink-900">
                        {faq.question}
                      </summary>
                      <p className="mt-2 text-sm text-ink-600">{faq.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}
          </div>

          <div className="space-y-6">
            {course.instructor_name && (
              <div className="rounded-2xl border border-ink-100 bg-white p-6">
                <h3 className="text-sm font-semibold text-ink-400">Instructor</h3>
                <div className="mt-3 flex items-center gap-3">
                  {course.instructor_avatar_url ? (
                    <Image
                      src={course.instructor_avatar_url}
                      alt={course.instructor_name}
                      width={48}
                      height={48}
                      className="rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-ink-200" />
                  )}
                  <p className="font-medium text-ink-900">{course.instructor_name}</p>
                </div>
                {course.instructor_bio && (
                  <p className="mt-3 text-sm text-ink-600">{course.instructor_bio}</p>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-ink-100 bg-white p-6">
              <h3 className="text-sm font-semibold text-ink-400">Course information</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-500">Sections</dt>
                  <dd className="font-medium text-ink-900">{sections.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">Lessons</dt>
                  <dd className="font-medium text-ink-900">{totalLessons}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">Total duration</dt>
                  <dd className="font-medium text-ink-900">{formatDuration(totalDuration)}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
