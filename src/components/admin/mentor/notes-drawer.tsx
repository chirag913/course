"use client";

import { Drawer } from "./drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { addMentorshipNote } from "@/app/admin/mentorship/[programId]/students/[enrollmentId]/actions";
import { Users } from "lucide-react";

interface Note {
  id: string;
  note: string;
  is_mentor_direction: boolean;
  created_at: string;
  profiles?: { full_name: string | null } | null;
}

export function NotesDrawer({
  programId,
  enrollmentId,
  notes,
  onClose,
}: {
  programId: string;
  enrollmentId: string;
  notes: Note[] | null;
  onClose: () => void;
}) {
  return (
    <Drawer title="Mentor Notes" onClose={onClose}>
      <form action={addMentorshipNote.bind(null, programId, enrollmentId)} className="space-y-3">
        <Textarea name="note" rows={3} placeholder="Add a new note..." required />
        <Button size="sm">Add note</Button>
      </form>

      <div className="mt-5">
        {notes && notes.length > 0 ? (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="rounded-md border border-ink-300 p-3">
                {note.is_mentor_direction && (
                  <Badge tone="brand" className="mb-1">
                    DIRECTION
                  </Badge>
                )}
                <p className="text-sm text-ink-800">{note.note}</p>
                <p className="mt-1 font-mono text-xs text-ink-500">
                  {note.profiles?.full_name ?? "Unknown"} · {formatDate(note.created_at)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Users} title="No mentor notes yet" />
        )}
      </div>
    </Drawer>
  );
}
