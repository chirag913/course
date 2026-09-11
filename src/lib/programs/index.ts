import { createClient } from "@/lib/supabase/server";
import { getProgramTypeAdapter, registerProgramTypeAdapter } from "./provider";
import {
  type ProgramTypeAdapter,
  type ProgramRouteContext,
  type UserProgram,
  type ProgramType,
} from "./types";

import "./course";
import "./mentorship";

type ProgramJoinRow = {
  id: string;
  type_id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  thumbnail_url: string | null;
  price: number;
  currency: string;
  status: string;
};

type CourseJoinRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  thumbnail_url: string | null;
  status: string;
  price: number;
  currency: string;
};

type EnrolledProgramRow = {
  id: string;
  course_id: string | null;
  program_id: string | null;
  enrolled_at: string;
  programs: ProgramJoinRow | ProgramJoinRow[] | null;
  courses: CourseJoinRow | CourseJoinRow[] | null;
};

function asSingleRow<T>(row: T | T[] | null | undefined): T | null {
  if (!row) return null;
  if (Array.isArray(row)) return row[0] ?? null;
  return row;
}

const UNKNOWN_TYPE_PREFIX = "unknown-program-type";

const fallbackUnknownAdapter: ProgramTypeAdapter = {
  typeId: UNKNOWN_TYPE_PREFIX,
  getPresentationMetadata: () => ({
    typeLabel: "Unknown program type",
    badgeTone: "warning",
    actionLabel: "Open Program Hub",
  }),
  getDashboardRoute: () => "/dashboard",
};

const unknownAdapterForType = (typeId: ProgramType): ProgramTypeAdapter => ({
  ...fallbackUnknownAdapter,
  typeId,
  getPresentationMetadata: (program, context) =>
    fallbackUnknownAdapter.getPresentationMetadata(program, context),
});

export function getProgramTypeAdapterOrUnknown(typeId: ProgramType): ProgramTypeAdapter {
  return getProgramTypeAdapter(typeId) ?? unknownAdapterForType(typeId);
}

export async function getUserEnrolledPrograms(userId: string): Promise<UserProgram[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("enrollments")
    .select(
      `
      id,
      course_id,
      program_id,
      enrolled_at,
      programs!left(
        id,
        type_id,
        slug,
        title,
        subtitle,
        description,
        thumbnail_url,
        price,
        currency,
        status
      ),
      courses!left(
        id,
        slug,
        title,
        subtitle,
        thumbnail_url,
        status,
        price,
        currency
      )
      `
    )
    .eq("user_id", userId)
    .order("enrolled_at", { ascending: false });

  if (error) {
    return [];
  }

  const rows = (data ?? []) as EnrolledProgramRow[];
  const programs: UserProgram[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const programRow = asSingleRow(row.programs);
    const courseRow = asSingleRow(row.courses);

    const sourceData = programRow ?? {
      id: row.program_id ?? row.course_id,
      type_id: row.program_id || row.course_id ? "course" : "unknown",
      slug: courseRow?.slug ?? "",
      title: courseRow?.title ?? "",
      subtitle: courseRow?.subtitle ?? null,
      description: null,
      thumbnail_url: courseRow?.thumbnail_url ?? null,
      price: courseRow?.price ?? 0,
      currency: courseRow?.currency ?? "INR",
      status: courseRow?.status ?? "draft",
    };

    const programId = sourceData.id ?? row.program_id ?? row.course_id;
    if (!programId || seen.has(programId)) {
      continue;
    }
    seen.add(programId);

    programs.push({
      enrollmentId: row.id,
      programId,
      courseId: row.course_id,
      programType: sourceData.type_id,
      slug: sourceData.slug,
      title: sourceData.title,
      subtitle: sourceData.subtitle,
      thumbnailUrl: sourceData.thumbnail_url,
      status: sourceData.status,
      price: sourceData.price,
      currency: sourceData.currency,
      enrolledAt: row.enrolled_at,
    });
  }

  return programs;
}

export async function getProgramDashboardContext(
  userId: string,
  program: UserProgram,
  adapter: ProgramTypeAdapter
): Promise<ProgramRouteContext> {
  if (!adapter.getDashboardContext) return {};
  return adapter.getDashboardContext(userId, program);
}

export { getProgramTypeAdapter, registerProgramTypeAdapter };
