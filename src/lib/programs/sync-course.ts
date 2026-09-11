import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Course-type `programs` rows must mirror the fields checkout and the admin
// assignment picker actually read from `programs` (title/slug/price/currency/
// status) — see migration 0002's deferred note: course creation was never
// wired to also write the `programs` row it depends on. Upserting here (by
// the shared id) both keeps existing rows in sync and self-heals any course
// that was created before this existed.
export async function syncCourseProgram(
  supabase: SupabaseClient,
  course: {
    id: string;
    slug: string;
    title: string;
    subtitle: string | null;
    description: string | null;
    price: number;
    currency: string;
    status: string;
    what_you_will_learn: string[];
    published_at: string | null;
    created_by: string | null;
  }
): Promise<void> {
  const { error } = await supabase.from("programs").upsert({
    id: course.id,
    type_id: "course",
    slug: course.slug,
    title: course.title,
    subtitle: course.subtitle,
    description: course.description,
    price: course.price,
    currency: course.currency,
    status: course.status,
    what_you_will_learn: course.what_you_will_learn,
    published_at: course.published_at,
    created_by: course.created_by,
  });
  if (error) throw new Error("Could not sync program record for this course.");
}
