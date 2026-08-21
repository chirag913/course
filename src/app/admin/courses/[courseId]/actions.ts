"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { courseInfoSchema, sectionSchema, lessonSchema, testimonialSchema, faqSchema } from "@/lib/validations";
import { getVideoProvider } from "@/lib/video";
import { slugify } from "@/lib/utils";

function revalidateCourse(courseId: string) {
  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath("/admin/courses");
}

// ---------------------------------------------------------------- course --
export async function updateCourseInfo(courseId: string, formData: FormData) {
  await requireAdmin();
  const raw = Object.fromEntries(formData.entries());
  // The form collects price in rupees for a human-friendly input; the
  // database stores paise (INR minor unit) per DATABASE.md.
  const priceInPaise = Math.round(Number(raw.price || 0) * 100);
  const slug = slugify(String(raw.slug ?? ""));
  const parsed = courseInfoSchema.safeParse({ ...raw, price: priceInPaise, slug });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input.");

  const whatYouWillLearn = String(raw.what_you_will_learn ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const supabase = await createClient();

  const { data: slugOwner } = await supabase
    .from("courses")
    .select("id")
    .eq("slug", parsed.data.slug)
    .maybeSingle();
  if (slugOwner && slugOwner.id !== courseId) {
    throw new Error("That URL slug is already used by another course.");
  }

  const { error } = await supabase
    .from("courses")
    .update({ ...parsed.data, what_you_will_learn: whatYouWillLearn })
    .eq("id", courseId);
  if (error) throw new Error("Could not save course info.");
  revalidateCourse(courseId);
}

export async function updateThumbnail(courseId: string, thumbnailUrl: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("courses").update({ thumbnail_url: thumbnailUrl }).eq("id", courseId);
  if (error) throw new Error("Could not save thumbnail.");
  revalidateCourse(courseId);
}

// -------------------------------------------------------------- sections --
export async function createSection(courseId: string, title: string) {
  await requireAdmin();
  const parsed = sectionSchema.safeParse({ title });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid title.");

  const supabase = await createClient();
  const { count } = await supabase
    .from("course_sections")
    .select("*", { count: "exact", head: true })
    .eq("course_id", courseId);

  const { error } = await supabase
    .from("course_sections")
    .insert({ course_id: courseId, title: parsed.data.title, position: count ?? 0 });
  if (error) throw new Error("Could not create section.");
  revalidateCourse(courseId);
}

export async function updateSection(courseId: string, sectionId: string, title: string) {
  await requireAdmin();
  const parsed = sectionSchema.safeParse({ title });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid title.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("course_sections")
    .update({ title: parsed.data.title })
    .eq("id", sectionId);
  if (error) throw new Error("Could not rename section.");
  revalidateCourse(courseId);
}

export async function deleteSection(courseId: string, sectionId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("course_sections").delete().eq("id", sectionId);
  if (error) throw new Error("Could not delete section.");
  revalidateCourse(courseId);
}

export async function reorderSections(courseId: string, orderedIds: string[]) {
  await requireAdmin();
  const supabase = await createClient();
  await Promise.all(
    orderedIds.map((id, index) => supabase.from("course_sections").update({ position: index }).eq("id", id))
  );
  revalidateCourse(courseId);
}

// --------------------------------------------------------------- lessons --
export interface LessonFormInput {
  title: string;
  lesson_type: "video" | "text" | "resource" | "mixed";
  description?: string;
  content?: string;
  video_url?: string;
  duration_seconds?: number;
  is_free_preview?: boolean;
  is_published?: boolean;
}

export async function createLesson(courseId: string, sectionId: string, input: LessonFormInput) {
  await requireAdmin();
  const parsed = lessonSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid lesson.");

  const supabase = await createClient();
  const { count } = await supabase
    .from("lessons")
    .select("*", { count: "exact", head: true })
    .eq("course_section_id", sectionId);

  let videoId: string | null = null;
  if (parsed.data.video_url) {
    videoId = getVideoProvider("youtube").extractId(parsed.data.video_url);
    if (!videoId) throw new Error("That doesn't look like a valid YouTube URL.");
  }

  const { data: lesson, error } = await supabase
    .from("lessons")
    .insert({
      course_section_id: sectionId,
      title: parsed.data.title,
      lesson_type: parsed.data.lesson_type,
      description: parsed.data.description || null,
      content: parsed.data.content || null,
      video_provider: videoId ? "youtube" : null,
      video_id: videoId,
      duration_seconds: parsed.data.duration_seconds ?? 0,
      is_free_preview: parsed.data.is_free_preview ?? false,
      is_published: parsed.data.is_published ?? true,
      position: count ?? 0,
    })
    .select()
    .single();
  if (error || !lesson) throw new Error("Could not create lesson.");
  revalidateCourse(courseId);
  return lesson;
}

export async function updateLesson(courseId: string, lessonId: string, input: LessonFormInput) {
  await requireAdmin();
  const parsed = lessonSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid lesson.");

  let videoId: string | null = null;
  if (parsed.data.video_url) {
    videoId = getVideoProvider("youtube").extractId(parsed.data.video_url);
    if (!videoId) throw new Error("That doesn't look like a valid YouTube URL.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("lessons")
    .update({
      title: parsed.data.title,
      lesson_type: parsed.data.lesson_type,
      description: parsed.data.description || null,
      content: parsed.data.content || null,
      video_provider: videoId ? "youtube" : null,
      video_id: videoId,
      duration_seconds: parsed.data.duration_seconds ?? 0,
      is_free_preview: parsed.data.is_free_preview ?? false,
      is_published: parsed.data.is_published ?? true,
    })
    .eq("id", lessonId);
  if (error) throw new Error("Could not save lesson.");
  revalidateCourse(courseId);
}

export async function deleteLesson(courseId: string, lessonId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { data: resources } = await supabase
    .from("lesson_resources")
    .select("file_path")
    .eq("lesson_id", lessonId);
  if (resources && resources.length > 0) {
    await supabase.storage.from("course-materials").remove(resources.map((r) => r.file_path));
  }

  const { error } = await supabase.from("lessons").delete().eq("id", lessonId);
  if (error) throw new Error("Could not delete lesson.");
  revalidateCourse(courseId);
}

export async function reorderLessons(courseId: string, orderedIds: string[]) {
  await requireAdmin();
  const supabase = await createClient();
  await Promise.all(
    orderedIds.map((id, index) => supabase.from("lessons").update({ position: index }).eq("id", id))
  );
  revalidateCourse(courseId);
}

// -------------------------------------------------------------- resources --
export async function addResource(
  courseId: string,
  lessonId: string,
  resource: { name: string; file_path: string; file_type: string; file_size: number; description?: string }
) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("lesson_resources").insert({ lesson_id: lessonId, ...resource });
  if (error) throw new Error("Could not attach file.");
  revalidateCourse(courseId);
}

export async function deleteResource(courseId: string, resourceId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { data: resource } = await supabase
    .from("lesson_resources")
    .select("file_path")
    .eq("id", resourceId)
    .single();
  if (resource) {
    await supabase.storage.from("course-materials").remove([resource.file_path]);
  }
  const { error } = await supabase.from("lesson_resources").delete().eq("id", resourceId);
  if (error) throw new Error("Could not remove file.");
  revalidateCourse(courseId);
}

// ---------------------------------------------------------- testimonials --
export async function addTestimonial(
  courseId: string,
  input: { student_name: string; content: string; rating: number }
) {
  await requireAdmin();
  const parsed = testimonialSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid testimonial.");

  const supabase = await createClient();
  const { count } = await supabase
    .from("testimonials")
    .select("*", { count: "exact", head: true })
    .eq("course_id", courseId);
  const { error } = await supabase
    .from("testimonials")
    .insert({ course_id: courseId, ...parsed.data, position: count ?? 0 });
  if (error) throw new Error("Could not add testimonial.");
  revalidateCourse(courseId);
}

export async function deleteTestimonial(courseId: string, testimonialId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("testimonials").delete().eq("id", testimonialId);
  if (error) throw new Error("Could not remove testimonial.");
  revalidateCourse(courseId);
}

// ------------------------------------------------------------------ faqs --
export async function addFaq(courseId: string, input: { question: string; answer: string }) {
  await requireAdmin();
  const parsed = faqSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid FAQ.");

  const supabase = await createClient();
  const { count } = await supabase
    .from("faqs")
    .select("*", { count: "exact", head: true })
    .eq("course_id", courseId);
  const { error } = await supabase.from("faqs").insert({ course_id: courseId, ...parsed.data, position: count ?? 0 });
  if (error) throw new Error("Could not add FAQ.");
  revalidateCourse(courseId);
}

export async function deleteFaq(courseId: string, faqId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("faqs").delete().eq("id", faqId);
  if (error) throw new Error("Could not remove FAQ.");
  revalidateCourse(courseId);
}
