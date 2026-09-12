"use client";

import { Drawer } from "./drawer";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { addMentorshipCall, updateMentorshipCall } from "@/app/admin/mentorship/[programId]/students/[enrollmentId]/actions";
import type { MentorshipCall } from "@/types/database";

const KNOWN_CALL_STATUSES = ["scheduled", "completed", "cancelled"];

function toInputDateTime(date: string) {
  return new Date(date).toISOString().slice(0, 16);
}

export function CallsDrawer({
  programId,
  enrollmentId,
  calls,
  onClose,
}: {
  programId: string;
  enrollmentId: string;
  calls: MentorshipCall[];
  onClose: () => void;
}) {
  return (
    <Drawer title="Calls" onClose={onClose}>
      <form action={addMentorshipCall.bind(null, programId, enrollmentId)} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="scheduled_at">Scheduled at</Label>
            <Input id="scheduled_at" name="scheduled_at" type="datetime-local" required defaultValue={toInputDateTime(new Date().toISOString())} />
          </div>
          <div>
            <Label htmlFor="call_status">Status</Label>
            <select
              id="call_status"
              name="status"
              defaultValue="scheduled"
              className="h-10 w-full rounded-md border border-ink-300 bg-ink-100 px-3 text-sm text-ink-900"
            >
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
        <Input name="meeting_link" placeholder="Meeting link" />
        <Textarea name="call_notes" rows={2} placeholder="Call notes" />
        <Button size="sm">Schedule call</Button>
      </form>

      <div className="mt-5 space-y-3">
        {calls.length === 0 ? (
          <p className="text-sm text-ink-500">No calls yet.</p>
        ) : (
          calls.map((call) => (
            <form key={call.id} action={updateMentorshipCall.bind(null, programId, enrollmentId)} className="grid gap-3 border-t border-ink-300 pt-3">
              <input type="hidden" name="call_id" value={call.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Scheduled</Label>
                  <Input name="scheduled_at" type="datetime-local" defaultValue={toInputDateTime(call.scheduled_at)} required />
                </div>
                <div>
                  <Label>Status</Label>
                  <select
                    name="status"
                    defaultValue={call.status}
                    className="h-10 w-full rounded-md border border-ink-300 bg-ink-100 px-3 text-sm text-ink-900"
                  >
                    {!KNOWN_CALL_STATUSES.includes(call.status) && <option value={call.status}>{call.status} (legacy)</option>}
                    <option value="scheduled">Scheduled</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <Input name="meeting_link" placeholder="Meeting link" defaultValue={call.meeting_link ?? ""} />
              <Input name="recording_url" placeholder="Recording URL" defaultValue={call.recording_url ?? ""} />
              <Textarea name="call_notes" rows={2} defaultValue={call.call_notes ?? ""} />
              <Button variant="outline" size="sm">
                Save call
              </Button>
            </form>
          ))
        )}
      </div>
    </Drawer>
  );
}
