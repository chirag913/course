import type { MentorshipEffectiveStatus, MentorshipProfile } from "@/types/database";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// India Standard Time has a fixed +5:30 offset with no DST, so this is exact
// (not an approximation) for the lifetime of this platform's target market.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// `start_date`/`end_date`/`due_date` are plain calendar dates with no time
// component, meant to read the same way an admin in India would read them
// ("30 days remaining" should flip over at midnight IST, not at 5:30am IST
// when the UTC date rolls over). Every place that needs "what calendar date
// is this instant" goes through this function so the boundary is applied
// exactly once, consistently.
export function toIstIsoDate(instant: Date | string = new Date()): string {
  const ms = typeof instant === "string" ? new Date(instant).getTime() : instant.getTime();
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function todayIstIsoDate(): string {
  return toIstIsoDate(new Date());
}

// Date-only arithmetic below treats ISO date strings ("YYYY-MM-DD") as UTC
// midnight purely as a stable anchor for subtraction/addition — since both
// operands go through the same convention, only the calendar date each
// string represents matters, and that's already been correctly pinned to
// IST by toIstIsoDate() above before it ever reaches these functions.
function parseAnchorDate(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00.000Z`).getTime();
}

function daysBetweenIsoDates(fromIsoDate: string, toIsoDate: string): number {
  return Math.round((parseAnchorDate(toIsoDate) - parseAnchorDate(fromIsoDate)) / MS_PER_DAY);
}

// The only stored statuses are active/paused/revoked — "expired" is derived
// so nothing needs a cron job to flip it.
export function getEffectiveMentorshipStatus(
  profile: Pick<MentorshipProfile, "access_status" | "end_date">,
  todayIsoDate: string = todayIstIsoDate()
): MentorshipEffectiveStatus {
  if (profile.access_status === "active" && profile.end_date && profile.end_date < todayIsoDate) {
    return "expired";
  }
  return profile.access_status;
}

// Remaining days is frozen at the moment a pause began (comparing against
// paused_at, not "now") so it doesn't keep ticking down while access is
// paused — resuming later re-anchors the clock by shifting end_date forward.
export function getRemainingDays(
  profile: Pick<MentorshipProfile, "access_status" | "end_date" | "paused_at">,
  now: Date = new Date()
): number | null {
  if (!profile.end_date) return null;

  const referenceIsoDate =
    profile.access_status === "paused" && profile.paused_at ? toIstIsoDate(profile.paused_at) : toIstIsoDate(now);

  return Math.max(0, daysBetweenIsoDates(referenceIsoDate, profile.end_date));
}

// Used by resumeMentorshipAccess to shift end_date forward by exactly how
// long access was actually paused. This measures real elapsed wall-clock
// duration between two instants, so it's timezone-agnostic by construction —
// no IST conversion needed here.
export function computePausedDays(pausedAtIso: string, resumedAt: Date = new Date()): number {
  const pausedAtMs = new Date(pausedAtIso).getTime();
  return Math.max(0, Math.round((resumedAt.getTime() - pausedAtMs) / MS_PER_DAY));
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const ms = parseAnchorDate(isoDate) + days * MS_PER_DAY;
  return new Date(ms).toISOString().slice(0, 10);
}
