import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({ positionSeconds: z.coerce.number().int().min(0) });

// Upserts playback position. RLS (progress_insert_own_if_enrolled /
// progress_update_own) is the real enforcement layer — a request for a
// lesson the user isn't enrolled in (and isn't a free preview) is rejected
// by Postgres, not by application logic.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, course_section_id, course_sections(course_id)")
    .eq("id", lessonId)
    .single();
  if (!lesson) return NextResponse.json({ error: "Lesson not found." }, { status: 404 });

  const courseId = (lesson.course_sections as unknown as { course_id: string }).course_id;

  const { error } = await supabase.from("lesson_progress").upsert(
    {
      user_id: user.id,
      lesson_id: lessonId,
      course_id: courseId,
      last_position_seconds: parsed.data.positionSeconds,
      last_viewed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,lesson_id" }
  );

  if (error) return NextResponse.json({ error: "Could not save progress." }, { status: 403 });
  return NextResponse.json({ success: true });
}
