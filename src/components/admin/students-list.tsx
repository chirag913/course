"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { InviteStudentForm } from "@/components/admin/invite-student-form";
import { Search, Users } from "lucide-react";
import type { MentorshipEffectiveStatus } from "@/types/database";

export interface StudentProgramSummary {
  enrollmentId: string;
  programId: string;
  title: string;
  typeId: string;
  effectiveStatus: MentorshipEffectiveStatus | null;
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

type Filter = "all" | "no_program" | "course" | "mentorship" | "active" | "paused" | "expired" | "revoked";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "no_program", label: "No Program" },
  { value: "course", label: "Course" },
  { value: "mentorship", label: "Mentorship" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Revoked" },
];

const STATUS_TONE: Record<MentorshipEffectiveStatus, "success" | "warning" | "neutral"> = {
  active: "success",
  paused: "warning",
  revoked: "warning",
  expired: "neutral",
};

function matchesFilter(student: StudentRow, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "no_program") return student.programs.length === 0;
  if (filter === "course") return student.programs.some((p) => p.typeId === "course");
  if (filter === "mentorship") return student.programs.some((p) => p.typeId === "mentorship");
  return student.programs.some((p) => p.effectiveStatus === filter);
}

export function StudentsList({ students }: { students: StudentRow[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

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
        {FILTERS.map((f) => (
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
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {filtered.length > 0 ? (
          <div className="border-t border-ink-300">
            <div className="divide-y divide-ink-300">
              {filtered.map((student) => (
                <Link
                  key={student.id}
                  href={`/admin/students/${student.id}`}
                  className="flex flex-wrap items-start justify-between gap-3 py-4 transition-colors hover:bg-ink-100/60"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">{student.fullName ?? "Unnamed"}</p>
                    <p className="text-sm text-ink-500">{student.email}</p>
                    {student.phone && <p className="mt-0.5 font-mono text-xs text-ink-500">{student.phone}</p>}
                  </div>
                  <div className="text-right">
                    {student.programs.length > 0 ? (
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {student.programs.map((p) => (
                          <Badge
                            key={p.enrollmentId}
                            tone={p.effectiveStatus ? STATUS_TONE[p.effectiveStatus] : "brand"}
                          >
                            {p.title}
                            {p.effectiveStatus ? ` · ${p.effectiveStatus}` : ""}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <Badge>No program</Badge>
                    )}
                    <p className="mt-1.5 font-mono text-xs text-ink-500">Joined {formatDate(student.joinedAt)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState icon={Users} title="No students match" description="Try a different search or filter." />
        )}
      </div>
    </div>
  );
}
