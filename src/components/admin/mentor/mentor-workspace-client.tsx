"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WeeklyFocus } from "./weekly-focus";
import { NextCallCard } from "./next-call-card";
import { MentorDirectionCard } from "./mentor-direction-card";
import { TaskHistoryDrawer } from "./task-history-drawer";
import { CallsDrawer } from "./calls-drawer";
import { NotesDrawer } from "./notes-drawer";
import type { MentorshipCall, MentorshipTask } from "@/types/database";

interface Note {
  id: string;
  note: string;
  is_mentor_direction: boolean;
  created_at: string;
  profiles?: { full_name: string | null } | null;
}

type OpenDrawer = "tasks" | "calls" | "notes" | null;

// The one client "conductor" for the pieces of the cockpit that need to
// open each other's history drawers (Weekly Focus -> task history, Next
// Call -> call history, Mentor Direction -> notes history) — everything
// else on the page manages its own single drawer locally.
export function MentorWorkspaceClient({
  programId,
  enrollmentId,
  weeklyFocusTasks,
  openTasks,
  completedOrSkippedTasks,
  catalogProducts,
  upcomingCall,
  lastCompletedCall,
  allCalls,
  latestDirection,
  allNotes,
}: {
  programId: string;
  enrollmentId: string;
  weeklyFocusTasks: MentorshipTask[];
  openTasks: MentorshipTask[];
  completedOrSkippedTasks: MentorshipTask[];
  catalogProducts: { id: string; name: string }[];
  upcomingCall: MentorshipCall | null;
  lastCompletedCall: MentorshipCall | null;
  allCalls: MentorshipCall[];
  latestDirection: { note: string; created_at: string } | null;
  allNotes: Note[] | null;
}) {
  const [openDrawer, setOpenDrawer] = useState<OpenDrawer>(null);

  return (
    <>
      <WeeklyFocus
        programId={programId}
        enrollmentId={enrollmentId}
        tasks={weeklyFocusTasks}
        onOpenHistory={() => setOpenDrawer("tasks")}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <MentorDirectionCard programId={programId} enrollmentId={enrollmentId} latestDirection={latestDirection} />
        <NextCallCard upcomingCall={upcomingCall} lastCompletedCall={lastCompletedCall} onOpenHistory={() => setOpenDrawer("calls")} />
      </div>

      <div>
        <Button variant="ghost" size="sm" onClick={() => setOpenDrawer("notes")}>
          View all mentor notes →
        </Button>
      </div>

      {openDrawer === "tasks" && (
        <TaskHistoryDrawer
          programId={programId}
          enrollmentId={enrollmentId}
          openTasks={openTasks}
          completedOrSkippedTasks={completedOrSkippedTasks}
          catalogProducts={catalogProducts}
          onClose={() => setOpenDrawer(null)}
        />
      )}
      {openDrawer === "calls" && (
        <CallsDrawer programId={programId} enrollmentId={enrollmentId} calls={allCalls} onClose={() => setOpenDrawer(null)} />
      )}
      {openDrawer === "notes" && (
        <NotesDrawer programId={programId} enrollmentId={enrollmentId} notes={allNotes} onClose={() => setOpenDrawer(null)} />
      )}
    </>
  );
}
