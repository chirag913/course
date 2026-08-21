import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({ completed: z.boolean() });

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
    .select("id, course_sections(course_id)")
    .eq("id", lessonId)
    .single();
  if (!lesson) return NextResponse.json({ error: "Lesson not found." }, { status: 404 });

  const courseId = (lesson.course_sections as unknown as { course_id: string }).course_id;
  const completed = parsed.data.completed;

  const { error } = await supabase.from("lesson_progress").upsert(
    {
      user_id: user.id,
      lesson_id: lessonId,
      course_id: courseId,
      is_completed: completed,
      completed_at: completed ? new Date().toISOString() : null,
      last_viewed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,lesson_id" }
  );

  if (error) return NextResponse.json({ error: "Could not update lesson." }, { status: 403 });
  return NextResponse.json({ success: true });
}
