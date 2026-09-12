"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { addMentorshipNote } from "@/app/admin/mentorship/[programId]/students/[enrollmentId]/actions";

interface DirectionNote {
  note: string;
  created_at: string;
}

export function MentorDirectionCard({
  programId,
  enrollmentId,
  latestDirection,
}: {
  programId: string;
  enrollmentId: string;
  latestDirection: DirectionNote | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await addMentorshipNote(programId, enrollmentId, formData);
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-ink-300 bg-ink-100 p-5">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg font-semibold text-ink-900">Mentor Direction</p>
        {!editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>

      {editing ? (
        <form action={handleSubmit} className="mt-3 space-y-2">
          <input type="hidden" name="is_direction" value="true" />
          <Textarea name="note" rows={2} placeholder="Focus on..." required defaultValue={latestDirection?.note ?? ""} />
          <div className="flex gap-2">
            <Button size="sm" loading={isPending}>
              Save
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : latestDirection ? (
        <div className="mt-2">
          <p className="text-sm italic text-ink-800">&quot;{latestDirection.note}&quot;</p>
          <p className="mt-1 font-mono text-xs text-ink-500">{formatDate(latestDirection.created_at)}</p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-ink-500">No direction set yet.</p>
      )}
    </div>
  );
}
