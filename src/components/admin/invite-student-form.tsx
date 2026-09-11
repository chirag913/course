"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { inviteStudent } from "@/app/admin/students/actions";

export function InviteStudentForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setOpen(false);
    setFullName("");
    setEmail("");
    setError(null);
    setSent(false);
  }

  function handleInvite() {
    setError(null);
    startTransition(async () => {
      try {
        await inviteStudent(fullName, email);
        setSent(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not send invite.");
      }
    });
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        + Add Student
      </Button>
    );
  }

  return (
    <div className="w-full border border-ink-300 bg-ink-100 p-4 sm:w-auto sm:min-w-[320px]">
      {sent ? (
        <div>
          <p className="text-sm text-ink-900">
            Invite sent to <span className="font-medium">{email}</span>. They&apos;ll appear here once they set a
            password and sign in.
          </p>
          <Button size="sm" variant="ghost" className="mt-2" onClick={reset}>
            Done
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase tracking-wide text-ink-500">Invite a student</p>
            <Button variant="ghost" size="sm" onClick={reset}>
              Cancel
            </Button>
          </div>
          <p className="mt-1 text-xs text-ink-500">
            For someone who hasn&apos;t signed up yet. We&apos;ll email them a link to set their own password — we
            never see or set it for them.
          </p>
          <div className="mt-3 grid gap-3">
            <div>
              <Label htmlFor="invite-name">Name</Label>
              <Input id="invite-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
              />
            </div>
          </div>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <Button className="mt-3" loading={isPending} disabled={!email.trim()} onClick={handleInvite}>
            Send invite
          </Button>
        </>
      )}
    </div>
  );
}
