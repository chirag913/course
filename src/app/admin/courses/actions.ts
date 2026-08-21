"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { slugify } from "@/lib/utils";

async function uniqueSlug(base: string): Promise<string> {
  const supabase = await createClient();
  const root = slugify(base) || "course";
  let candidate = root;
  let suffix = 1;
  // Small tables in V1 — a loop is simpler and clear enough than a clever
  // single query, and this only runs on course creation/duplication.
  while (true) {
    const { data } = await supabase.from("courses").select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }
}

export async function createCourse() {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const slug = await uniqueSlug("untitled-course");

  const { data: course, error } = await supabase
    .from("courses")
    .insert({ title: "Untitled Course", slug, created_by: admin.id })
    .select()
    .single();

  if (error || !course) throw new Error("Could not create course.");
  revalidatePath("/admin/courses");
  redirect(`/admin/courses/${course.id}`);
}

export async function duplicateCourse(courseId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { data: course } = await supabase.from("courses").select("*").eq("id", courseId).single();
  if (!course) throw new Error("Course not found.");

  const slug = await uniqueSlug(`${course.title}-copy`);
  const { data: newCourse, error } = await supabase
    .from("courses")
    .insert({
      title: `${course.title} (Copy)`,
      slug,
      subtitle: course.subtitle,
      description: course.description,
      thumbnail_url: course.thumbnail_url,
      price: course.price,
      currency: course.currency,
      status: "draft",
      what_you_will_learn: course.what_you_will_learn,
      instructor_name: course.instructor_name,
      instructor_bio: course.instructor_bio,
      instructor_avatar_url: course.instructor_avatar_url,
    })
    .select()
    .single();
  if (error || !newCourse) throw new Error("Could not duplicate course.");

  const { data: sections } = await supabase
    .from("course_sections")
    .select("*, lessons(*, lesson_resources(*))")
    .eq("course_id", courseId)
    .order("position");

  for (const section of sections ?? []) {
    const { data: newSection } = await supabase
      .from("course_sections")
      .insert({ course_id: newCourse.id, title: section.title, position: section.position })
      .select()
      .single();
    if (!newSection) continue;

    for (const lesson of section.lessons ?? []) {
      const { data: newLesson } = await supabase
        .from("lessons")
        .insert({
          course_section_id: newSection.id,
          title: lesson.title,
          description: lesson.description,
          lesson_type: lesson.lesson_type,
          video_provider: lesson.video_provider,
          video_id: lesson.video_id,
          duration_seconds: lesson.duration_seconds,
          content: lesson.content,
          position: lesson.position,
          is_published: lesson.is_published,
          is_free_preview: lesson.is_free_preview,
        })
        .select()
        .single();
      if (!newLesson) continue;

      for (const resource of lesson.lesson_resources ?? []) {
        await supabase.from("lesson_resources").insert({
          lesson_id: newLesson.id,
          name: resource.name,
          file_path: resource.file_path,
          file_type: resource.file_type,
          file_size: resource.file_size,
          description: resource.description,
        });
      }
    }
  }

  revalidatePath("/admin/courses");
  redirect(`/admin/courses/${newCourse.id}`);
}

export async function togglePublish(courseId: string, publish: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("courses")
    .update({
      status: publish ? "published" : "draft",
      published_at: publish ? new Date().toISOString() : null,
    })
    .eq("id", courseId);
  if (error) throw new Error("Could not update course status.");
  revalidatePath("/admin/courses");
  revalidatePath(`/admin/courses/${courseId}`);
}

export async function deleteCourse(courseId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("courses").delete().eq("id", courseId);
  if (error) {
    throw new Error(
      "Couldn't delete this course — it already has orders on record. Unpublish it instead to hide it from students."
    );
  }
  revalidatePath("/admin/courses");
}
