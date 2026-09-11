"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { assignCourseToStudent, assignMentorshipToStudent } from "@/app/admin/students/actions";

interface AvailableProgram {
  id: string;
  title: string;
  type_id: string;
  slug: string;
}

export function AssignProgramForm({
  userId,
  availablePrograms,
}: {
  userId: string;
  availablePrograms: AvailableProgram[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [programId, setProgramId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const courses = availablePrograms.filter((p) => p.type_id === "course");
  const mentorships = availablePrograms.filter((p) => p.type_id === "mentorship");
  const selected = availablePrograms.find((p) => p.id === programId) ?? null;

  function reset() {
    setOpen(false);
    setProgramId("");
    setError(null);
  }

  function handleAssignCourse() {
    setError(null);
    startTransition(async () => {
      try {
        await assignCourseToStudent(userId, programId);
        router.refresh();
        reset();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not assign course.");
      }
    });
  }

  function handleActivateMentorship(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await assignMentorshipToStudent(userId, programId, formData);
        router.refresh();
        reset();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not activate mentorship.");
      }
    });
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)} disabled={availablePrograms.length === 0}>
        + Assign Program
      </Button>
    );
  }

  return (
    <div className="w-full border border-ink-300 bg-ink-100 p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold text-ink-900">Assign Program</h3>
        <Button variant="ghost" size="sm" onClick={reset}>
          Cancel
        </Button>
      </div>

      <div className="mt-4">
        <Label htmlFor="assign-program-select">Program</Label>
        <select
          id="assign-program-select"
          value={programId}
          onChange={(e) => setProgramId(e.target.value)}
          className="h-10 w-full rounded-md border border-ink-300 bg-ink-50 px-3 text-sm text-ink-900"
        >
          <option value="">Select a program…</option>
          {courses.length > 0 && (
            <optgroup label="Courses">
              {courses.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </optgroup>
          )}
          {mentorships.length > 0 && (
            <optgroup label="Mentorship">
              {mentorships.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {selected?.type_id === "course" && (
        <div className="mt-5 border-t border-ink-300 pt-5">
          <p className="text-sm text-ink-500">
            This grants immediate access to <span className="font-medium text-ink-900">{selected.title}</span>. No
            payment record is created — this is a manual grant, not a purchase.
          </p>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          <Button className="mt-4" loading={isPending} onClick={handleAssignCourse}>
            Assign Course
          </Button>
        </div>
      )}

      {selected?.type_id === "mentorship" && (
        <form action={handleActivateMentorship} className="mt-5 space-y-4 border-t border-ink-300 pt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="start_date">Start date (optional — defaults to today)</Label>
              <Input id="start_date" name="start_date" type="date" />
            </div>
            <div>
              <Label htmlFor="duration_days">Duration (days)</Label>
              <Input id="duration_days" name="duration_days" type="number" min={1} defaultValue={30} required />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="payment_amount">Payment amount (₹, optional)</Label>
              <Input id="payment_amount" name="payment_amount" type="number" min={0} step="1" />
            </div>
            <div>
              <Label htmlFor="payment_status">Payment status</Label>
              <select
                id="payment_status"
                name="payment_status"
                defaultValue="pending"
                className="h-10 w-full rounded-md border border-ink-300 bg-ink-50 px-3 text-sm text-ink-900"
              >
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="due_date">Due date (optional)</Label>
              <Input id="due_date" name="due_date" type="date" />
            </div>
            <div>
              <Label htmlFor="razorpay_link">Razorpay payment link (optional)</Label>
              <Input id="razorpay_link" name="razorpay_link" placeholder="https://rzp.io/..." />
            </div>
          </div>

          <div>
            <Label htmlFor="whatsapp_phone">WhatsApp number (optional)</Label>
            <Input id="whatsapp_phone" name="whatsapp_phone" placeholder="+91 98765 43210" />
          </div>

          <div>
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          <Button loading={isPending}>Activate Mentorship</Button>
        </form>
      )}
    </div>
  );
}
