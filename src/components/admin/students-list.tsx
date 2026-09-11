"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { InviteStudentForm } from "@/components/admin/invite-student-form";
import { DeleteStudentButton } from "@/components/admin/delete-student-button";
import { Search, Users } from "lucide-react";
import type { MentorshipEffectiveStatus } from "@/types/database";

export interface StudentProgramSummary {
  enrollmentId: string;
  programId: string;
  title: string;
  typeId: string;
  effectiveStatus: MentorshipEffectiveStatus | null;
  remainingDays: number | null;
  enrolledAt: string;
}

export interface StudentRow {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  joinedAt: string;
  latestActivity: string | null;
  programs: StudentProgramSummary[];
}

type Filter = "all" | "not_enrolled" | "enrolled" | "course" | "mentorship" | "active" | "paused" | "expired" | "revoked";

const STATUS_TONE: Record<MentorshipEffectiveStatus, "success" | "warning" | "neutral"> = {
  active: "success",
  paused: "warning",
  revoked: "warning",
  expired: "neutral",
};

function matchesFilter(student: StudentRow, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "not_enrolled") return student.programs.length === 0;
  if (filter === "enrolled") return student.programs.length > 0;
  if (filter === "course") return student.programs.some((p) => p.typeId === "course");
  if (filter === "mentorship") return student.programs.some((p) => p.typeId === "mentorship");
  return student.programs.some((p) => p.effectiveStatus === filter);
}

function programSummary(programs: StudentProgramSummary[]): { label: string; tone: "success" | "warning" | "neutral" | "brand" } {
  if (programs.length === 0) return { label: "Not enrolled", tone: "neutral" };

  const mentorship = programs.find((p) => p.typeId === "mentorship" && p.effectiveStatus);
  if (programs.length === 1) {
    const p = programs[0]!;
    if (!p.effectiveStatus) return { label: "Enrolled", tone: "brand" };
    const remaining = p.remainingDays !== null && p.effectiveStatus === "active" ? ` · ${p.remainingDays}d left` : "";
    return { label: `${p.effectiveStatus}${remaining}`, tone: STATUS_TONE[p.effectiveStatus] };
  }
  return mentorship
    ? { label: `${programs.length} programs · ${mentorship.effectiveStatus}`, tone: STATUS_TONE[mentorship.effectiveStatus!] }
    : { label: `${programs.length} programs`, tone: "brand" };
}

export function StudentsList({ students }: { students: StudentRow[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: students.length,
      not_enrolled: 0,
      enrolled: 0,
      course: 0,
      mentorship: 0,
      active: 0,
      paused: 0,
      expired: 0,
      revoked: 0,
    };
    for (const s of students) {
      if (matchesFilter(s, "not_enrolled")) c.not_enrolled++;
      if (matchesFilter(s, "enrolled")) c.enrolled++;
      if (matchesFilter(s, "course")) c.course++;
      if (matchesFilter(s, "mentorship")) c.mentorship++;
      if (matchesFilter(s, "active")) c.active++;
      if (matchesFilter(s, "paused")) c.paused++;
      if (matchesFilter(s, "expired")) c.expired++;
      if (matchesFilter(s, "revoked")) c.revoked++;
    }
    return c;
  }, [students]);

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "not_enrolled", label: "Not Enrolled" },
    { value: "enrolled", label: "Enrolled" },
    { value: "mentorship", label: "Mentorship" },
    { value: "course", label: "Courses" },
    { value: "active", label: "Active" },
    { value: "paused", label: "Paused" },
    { value: "expired", label: "Expired" },
    { value: "revoked", label: "Revoked" },
  ];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (!matchesFilter(s, filter)) return false;
      if (!q) return true;
      return (s.fullName ?? "").toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
    });
  }, [students, search, filter]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email"
            className="pl-9"
          />
        </div>
        <InviteStudentForm />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors ${
              filter === f.value
                ? "border-ink-900 bg-ink-900 text-ink-50"
                : "border-ink-300 text-ink-500 hover:border-ink-500 hover:text-ink-900"
            }`}
          >
            {f.label} ({counts[f.value]})
          </button>
        ))}
      </div>

      <div className="mt-5">
        {filtered.length > 0 ? (
          <div className="border-t border-ink-300">
            <div className="divide-y divide-ink-300">
              {filtered.map((student) => {
                const summary = programSummary(student.programs);
                return (
                  <div key={student.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <p className="font-medium text-ink-900">{student.fullName ?? "Unnamed"}</p>
                      <p className="text-sm text-ink-500">{student.email}</p>
                      {student.phone && <p className="mt-0.5 font-mono text-xs text-ink-500">{student.phone}</p>}
                      {student.programs.length > 1 && (
                        <p className="mt-1 text-xs text-ink-500">
                          {student.programs.map((p) => p.title).join(" · ")}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <Badge tone={summary.tone}>{summary.label}</Badge>
                      <p className="font-mono text-xs text-ink-500">Joined {formatDate(student.joinedAt)}</p>
                      <div className="flex items-center gap-1">
                        <Link href={`/admin/students/${student.id}`}>
                          <Button size="sm" variant="outline">
                            View
                          </Button>
                        </Link>
                        <DeleteStudentButton userId={student.id} email={student.email} fullName={student.fullName} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <EmptyState icon={Users} title="No students match" description="Try a different search or filter." />
        )}
      </div>
    </div>
  );
}
