import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BuilderHeader } from "@/components/admin/builder-header";
import { CourseBuilderTabs } from "@/components/admin/course-builder-tabs";
import { CourseInfoForm } from "@/components/admin/course-info-form";
import { CurriculumEditor } from "@/components/admin/curriculum-editor";
import { TestimonialsFaqsEditor } from "@/components/admin/testimonials-faqs-editor";
import type { Course, SectionWithLessons, Testimonial, Faq, LessonWithResources } from "@/types/database";

interface Props {
  params: Promise<{ courseId: string }>;
}

export default async function CourseBuilderPage({ params }: Props) {
  const { courseId } = await params;
  const supabase = await createClient();

  const { data: course } = await supabase.from("courses").select("*").eq("id", courseId).single<Course>();
  if (!course) notFound();

  const [{ data: sections }, { data: testimonials }, { data: faqs }] = await Promise.all([
    supabase
      .from("course_sections")
      .select("*, lessons(*, lesson_resources(*))")
      .eq("course_id", courseId)
      .order("position"),
    supabase.from("testimonials").select("*").eq("course_id", courseId).order("position"),
    supabase.from("faqs").select("*").eq("course_id", courseId).order("position"),
  ]);

  const sectionsWithLessons = (sections ?? []).map((s) => ({
    ...s,
    lessons: (s.lessons ?? []).sort(
      (a: LessonWithResources, b: LessonWithResources) => a.position - b.position
    ),
  })) as SectionWithLessons[];

  return (
    <div>
      <BuilderHeader courseId={course.id} title={course.title} slug={course.slug} status={course.status} />

      <CourseBuilderTabs
        infoTab={<CourseInfoForm course={course} />}
        curriculumTab={<CurriculumEditor courseId={course.id} sections={sectionsWithLessons} />}
        salesPageTab={
          <TestimonialsFaqsEditor
            courseId={course.id}
            testimonials={(testimonials ?? []) as Testimonial[]}
            faqs={(faqs ?? []) as Faq[]}
          />
        }
      />
    </div>
  );
}
