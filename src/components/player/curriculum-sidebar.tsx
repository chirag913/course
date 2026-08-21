import Link from "next/link";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { SectionWithLessons } from "@/types/database";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

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
    <nav className="border border-ink-300">
      <h2 className="eyebrow border-b border-ink-300 px-4 py-3">Course Curriculum</h2>
      <div className="max-h-[75vh] overflow-y-auto p-2">
        {sections.map((section, sIdx) => (
          <div key={section.id} className="py-2">
            <p className="px-2 pb-1.5 font-mono text-[11px] tracking-wide text-ink-500">
              {pad(sIdx + 1)} — {section.title.toUpperCase()}
            </p>
            {section.lessons.map((lesson, lIdx) => {
              const isCurrent = lesson.id === currentLessonId;
              const isCompleted = completedLessonIds.has(lesson.id);
              return (
                <Link
                  key={lesson.id}
                  href={`/dashboard/learn/${courseSlug}/${lesson.id}`}
                  className={cn(
                    "flex items-center gap-2.5 border-l-2 px-3 py-2 text-sm transition-colors",
                    isCurrent
                      ? "border-brand-400 bg-ink-200 font-medium text-brand-300"
                      : "border-transparent text-ink-600 hover:bg-ink-200/60 hover:text-ink-900"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center font-mono text-[10px]",
                      isCompleted ? "text-success" : "text-ink-500"
                    )}
                  >
                    {isCompleted ? <Check className="h-3.5 w-3.5" /> : pad(lIdx + 1)}
                  </span>
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
