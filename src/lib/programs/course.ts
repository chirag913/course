import { getCourseProgress } from "@/lib/progress";
import { registerProgramTypeAdapter } from "./provider";
import type { ProgramRouteContext, ProgramType, ProgramTypeAdapter, UserProgram } from "./types";

const COURSE_PROGRAM_TYPE: ProgramType = "course";

async function getCourseDashboardContext(
  userId: string,
  program: UserProgram
): Promise<ProgramRouteContext> {
  if (!program.courseId) return {};

  const progress = await getCourseProgress(userId, program.courseId);
  return {
    resumeLessonId: progress.resumeLessonId,
    progressPercent: progress.percent,
    completedLessons: progress.completedLessons,
    totalLessons: progress.totalLessons,
  };
}

const courseProgramAdapter: ProgramTypeAdapter = {
  typeId: COURSE_PROGRAM_TYPE,
  getPresentationMetadata: (program, context) => ({
    typeLabel: "Course",
    badgeTone: "brand",
    actionLabel:
      typeof context?.progressPercent === "number" && context.progressPercent > 0
        ? "Continue Learning"
        : "Start Course",
  }),
  getDashboardRoute: (program, context) =>
    context?.resumeLessonId
      ? `/dashboard/learn/${program.slug}/${context.resumeLessonId}`
      : `/dashboard/learn/${program.slug}`,
  getDashboardContext: getCourseDashboardContext,
};

registerProgramTypeAdapter(courseProgramAdapter);
