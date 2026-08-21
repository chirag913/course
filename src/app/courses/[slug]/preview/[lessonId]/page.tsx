import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { VideoPlayer } from "@/components/video/video-player";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";

interface Props {
  params: Promise<{ slug: string; lessonId: string }>;
}

export default async function LessonPreviewPage({ params }: Props) {
  const { slug, lessonId } = await params;
  const supabase = await createClient();

  const { data: course } = await supabase
    .from("courses")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .single();
  if (!course) notFound();

  // RLS only returns this row because is_free_preview = true on a published
  // course — a locked lesson id here would come back null for a guest.
  const { data: lesson } = await supabase
    .from("lessons")
    .select("*, lesson_resources(*)")
    .eq("id", lessonId)
    .eq("is_free_preview", true)
    .single();
  if (!lesson) notFound();

  return (
    <div className="min-h-screen bg-ink-50">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Link href={`/courses/${slug}`} className="text-sm text-ink-500 hover:text-ink-900">
          ← Back to {course.title}
        </Link>

        <h1 className="mt-3 text-2xl font-bold text-ink-900">{lesson.title}</h1>
        <span className="mt-1 inline-block rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-700">
          Free Preview
        </span>

        {(lesson.lesson_type === "video" || lesson.lesson_type === "mixed") && (
          <div className="mt-6">
            <VideoPlayer
              provider={lesson.video_provider ?? "youtube"}
              videoId={lesson.video_id}
              title={lesson.title}
            />
          </div>
        )}

        {lesson.description && (
          <div className="prose-content mt-6" dangerouslySetInnerHTML={{ __html: lesson.description }} />
        )}
        {lesson.content && (lesson.lesson_type === "text" || lesson.lesson_type === "mixed") && (
          <div className="prose-content mt-6" dangerouslySetInnerHTML={{ __html: lesson.content }} />
        )}

        <div className="mt-10 rounded-2xl border border-ink-100 bg-white p-6 text-center">
          <p className="text-sm text-ink-600">Want the full course?</p>
          <p className="mt-1 text-xl font-semibold text-ink-900">
            {formatPrice(course.price, course.currency)}
          </p>
          <Link href={`/courses/${slug}`}>
            <Button className="mt-4">Get Instant Access</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
