import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import type { MentorshipCall } from "@/types/database";

export function NextCallCard({
  upcomingCall,
  lastCompletedCall,
  onOpenHistory,
}: {
  upcomingCall: MentorshipCall | null;
  lastCompletedCall: MentorshipCall | null;
  onOpenHistory: () => void;
}) {
  const time = upcomingCall
    ? new Date(upcomingCall.scheduled_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="rounded-lg border border-ink-300 bg-ink-100 p-5">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg font-semibold text-ink-900">Next Call</p>
        <Button variant="ghost" size="sm" onClick={onOpenHistory}>
          Call history →
        </Button>
      </div>

      {upcomingCall ? (
        <div className="mt-2">
          <p className="text-sm font-medium text-ink-900">
            {formatDate(upcomingCall.scheduled_at)} · {time}
          </p>
          {upcomingCall.meeting_link ? (
            <a href={upcomingCall.meeting_link} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="mt-2">
                Open Call
              </Button>
            </a>
          ) : (
            <p className="mt-1 text-xs text-ink-500">No meeting link yet.</p>
          )}
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-sm text-ink-500">No upcoming call scheduled.</p>
          {lastCompletedCall && (
            <p className="mt-1 font-mono text-xs text-ink-500">
              Last call: completed {formatDate(lastCompletedCall.scheduled_at)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
