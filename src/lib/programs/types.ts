export type ProgramType = string;

export interface Program {
  id: string;
  typeId: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  price: number;
  currency: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserProgram {
  enrollmentId: string;
  programId: string;
  courseId: string | null;
  programType: ProgramType;
  slug: string;
  title: string;
  subtitle: string | null;
  thumbnailUrl: string | null;
  status: string;
  price: number;
  currency: string;
  enrolledAt: string;
}

export interface ProgramRouteContext {
  resumeLessonId?: string | null;
  progressPercent?: number;
  completedLessons?: number;
  totalLessons?: number;
}

export interface ProgramPresentationMetadata {
  typeLabel: string;
  actionLabel: string;
  badgeTone: "brand" | "neutral" | "success" | "warning";
}

export interface ProgramTypeAdapter {
  typeId: ProgramType;
  getPresentationMetadata: (
    program: UserProgram,
    context?: ProgramRouteContext
  ) => ProgramPresentationMetadata;
  getDashboardRoute: (
    program: UserProgram,
    context?: ProgramRouteContext
  ) => string;
  getDashboardContext?: (
    userId: string,
    program: UserProgram
  ) => Promise<ProgramRouteContext>;
}
