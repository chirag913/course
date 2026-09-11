"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  lookupStudentByEmail,
  approveMentorshipStudent,
  type StudentLookupResult,
} from "@/app/admin/mentorship/actions";

export function ApproveMentorshipStudentForm({ programId }: { programId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [looked, setLooked] = useState(false);
  const [result, setResult] = useState<StudentLookupResult | null>(null);
  const [durationDays, setDurationDays] = useState(30);
  const [startDate, setStartDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setOpen(false);
    setEmail("");
    setLooked(false);
    setResult(null);
    setDurationDays(30);
    setStartDate("");
    setError(null);
  }

  function handleLookup() {
    setError(null);
    startTransition(async () => {
      const found = await lookupStudentByEmail(email);
      setResult(found);
      setLooked(true);
    });
  }

  function handleActivate() {
    if (!result) return;
    setError(null);
    startTransition(async () => {
      try {
        await approveMentorshipStudent(programId, {
          userId: result.id,
          durationDays,
          startDate: startDate || undefined,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not activate access.");
      }
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        + Add / Approve Student
      </Button>
    );
  }

  return (
    <div className="border border-ink-300 bg-ink-100 p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold text-ink-900">Add / Approve Student</h3>
        <Button variant="ghost" size="sm" onClick={reset}>
          Cancel
        </Button>
      </div>

      <div className="mt-4 flex items-end gap-3">
        <div className="flex-1">
          <Label htmlFor="lookup-email">Student email</Label>
          <Input
            id="lookup-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setLooked(false);
              setResult(null);
            }}
            placeholder="student@example.com"
          />
        </div>
        <Button onClick={handleLookup} loading={isPending} disabled={!email.trim()}>
          Look up
        </Button>
      </div>

      {looked && !result && (
        <p className="mt-3 text-sm text-danger">No account found. Ask the student to sign up first.</p>
      )}

      {result && (
        <div className="mt-5 border-t border-ink-300 pt-5">
          <p className="text-sm text-ink-900">
            <span className="font-medium">{result.fullName ?? "Unnamed"}</span> · {result.email}
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="duration-days">Duration (days)</Label>
              <Input
                id="duration-days"
                type="number"
                min={1}
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="start-date">Start date (optional — defaults to today)</Label>
              <Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-danger">{error}</p>}

          <Button className="mt-4" loading={isPending} onClick={handleActivate}>
            Activate Access
          </Button>
        </div>
      )}
    </div>
  );
}
