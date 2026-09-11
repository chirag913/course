import { registerProgramTypeAdapter } from "./provider";
import type { ProgramType, ProgramTypeAdapter } from "./types";

const MENTORSHIP_PROGRAM_TYPE: ProgramType = "mentorship";

const mentorshipProgramAdapter: ProgramTypeAdapter = {
  typeId: MENTORSHIP_PROGRAM_TYPE,
  getPresentationMetadata: () => ({
    typeLabel: "Mentorship",
    badgeTone: "neutral",
    actionLabel: "Open Mentorship",
  }),
  getDashboardRoute: (program) => `/dashboard/mentorship/${program.slug}`,
};

registerProgramTypeAdapter(mentorshipProgramAdapter);

