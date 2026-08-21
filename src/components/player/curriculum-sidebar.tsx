import Link from "next/link";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, PlayCircle } from "lucide-react";
import type { SectionWithLessons } from "@/types/database";

export function CurriculumSidebar({
  courseSlug,
  sections,
  currentLessonId,
  completedLessonIds,
}: {
  courseSlug: string;
  sections: SectionWithLessons[];
  currentLessonId: string;
  completedLessonIds: Set<string>;
}) {
  return (
    <nav className="rounded-2xl border border-ink-100 bg-white p-2">
      <h2 className="px-3 py-2 text-sm font-semibold text-ink-900">Course Curriculum</h2>
      <div className="max-h-[70vh] space-y-1 overflow-y-auto pb-2">
        {sections.map((section) => (
          <div key={section.id}>
            <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
              {section.title}
            </p>
            {section.lessons.map((lesson) => {
              const isCurrent = lesson.id === currentLessonId;
              const isCompleted = completedLessonIds.has(lesson.id);
              return (
                <Link
                  key={lesson.id}
                  href={`/dashboard/learn/${courseSlug}/${lesson.id}`}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                    isCurrent ? "bg-brand-50 font-medium text-brand-700" : "text-ink-600 hover:bg-ink-50"
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  ) : isCurrent ? (
                    <PlayCircle className="h-4 w-4 shrink-0 text-brand-600" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-ink-300" />
                  )}
                  <span className="line-clamp-1">{lesson.title}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
