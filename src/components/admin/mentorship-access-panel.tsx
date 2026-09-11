"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { getEffectiveMentorshipStatus, getRemainingDays } from "@/lib/mentorship-access";
import {
  pauseMentorshipAccess,
  resumeMentorshipAccess,
  revokeMentorshipAccess,
  restoreMentorshipAccess,
  extendMentorshipAccess,
} from "@/app/admin/mentorship/[programId]/students/[enrollmentId]/actions";
import type { MentorshipProfile } from "@/types/database";

const STATUS_TONE = {
  active: "success",
  paused: "warning",
  revoked: "warning",
  expired: "neutral",
} as const;

export function MentorshipAccessPanel({
  programId,
  enrollmentId,
  profile,
}: {
  programId: string;
  enrollmentId: string;
  profile: MentorshipProfile;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showExtend, setShowExtend] = useState(false);
  const [extendDays, setExtendDays] = useState(7);

  const effectiveStatus = getEffectiveMentorshipStatus(profile);
  const remainingDays = getRemainingDays(profile);

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed.");
      }
    });
  }

  return (
    <div className="border border-ink-300 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={STATUS_TONE[effectiveStatus]}>{effectiveStatus}</Badge>
        {remainingDays !== null && effectiveStatus !== "revoked" && effectiveStatus !== "expired" && (
          <span className="font-mono text-sm text-ink-700">{remainingDays} days remaining</span>
        )}
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="font-mono text-[11px] uppercase text-ink-500">Start</dt>
          <dd className="text-sm text-ink-900">{profile.start_date ? formatDate(profile.start_date) : "—"}</dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] uppercase text-ink-500">End</dt>
          <dd className="text-sm text-ink-900">{profile.end_date ? formatDate(profile.end_date) : "—"}</dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] uppercase text-ink-500">Duration</dt>
          <dd className="text-sm text-ink-900">{profile.duration_days ? `${profile.duration_days} days` : "—"}</dd>
        </div>
      </dl>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {profile.access_status === "active" && (
          <Button
            variant="outline"
            size="sm"
            loading={isPending}
            onClick={() => run(() => pauseMentorshipAccess(programId, enrollmentId))}
          >
            Pause
          </Button>
        )}
        {profile.access_status === "paused" && (
          <Button
            variant="outline"
            size="sm"
            loading={isPending}
            onClick={() => run(() => resumeMentorshipAccess(programId, enrollmentId))}
          >
            Resume
          </Button>
        )}
        {profile.access_status !== "revoked" && (
          <Button
            variant="danger"
            size="sm"
            loading={isPending}
            onClick={() => run(() => revokeMentorshipAccess(programId, enrollmentId))}
          >
            Revoke
          </Button>
        )}
        {profile.access_status === "revoked" && (
          <Button
            variant="outline"
            size="sm"
            loading={isPending}
            onClick={() => run(() => restoreMentorshipAccess(programId, enrollmentId))}
          >
            Restore
          </Button>
        )}
        {!showExtend ? (
          <Button variant="ghost" size="sm" onClick={() => setShowExtend(true)}>
            Extend
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Label className="sr-only" htmlFor="extend-days">
              Additional days
            </Label>
            <Input
              id="extend-days"
              type="number"
              min={1}
              value={extendDays}
              onChange={(e) => setExtendDays(Number(e.target.value))}
              className="h-8 w-20"
            />
            <Button
              size="sm"
              loading={isPending}
              onClick={() =>
                run(async () => {
                  await extendMentorshipAccess(programId, enrollmentId, extendDays);
                  setShowExtend(false);
                })
              }
            >
              Confirm
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowExtend(false)}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
