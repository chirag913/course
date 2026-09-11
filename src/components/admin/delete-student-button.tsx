"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { deleteStudentAccount } from "@/app/admin/students/actions";

export function DeleteStudentButton({
  userId,
  email,
  fullName,
  redirectAfterDelete,
}: {
  userId: string;
  email: string;
  fullName: string | null;
  redirectAfterDelete?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typedEmail, setTypedEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function close() {
    if (isPending) return;
    setOpen(false);
    setTypedEmail("");
    setError(null);
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteStudentAccount(userId, typedEmail);
        if (redirectAfterDelete) {
          router.push(redirectAfterDelete);
        } else {
          setOpen(false);
          router.refresh();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not delete this student.");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-danger"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={close}
        >
          <div
            className="w-full max-w-sm border border-ink-300 bg-ink-50 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-semibold text-danger">Delete Student?</h3>

            <dl className="mt-3 space-y-1">
              <div>
                <dt className="inline font-mono text-[11px] uppercase text-ink-500">Name: </dt>
                <dd className="inline text-sm text-ink-900">{fullName ?? "Unnamed"}</dd>
              </div>
              <div>
                <dt className="inline font-mono text-[11px] uppercase text-ink-500">Email: </dt>
                <dd className="inline text-sm text-ink-900">{email}</dd>
              </div>
            </dl>

            <p className="mt-3 text-sm text-ink-500">
              This permanently deletes this student&apos;s account and all associated data — enrollments,
              mentorship history, payments, and progress. This cannot be undone.
            </p>

            <div className="mt-4">
              <Label htmlFor="delete-confirm-email">Type the student&apos;s email to confirm</Label>
              <Input
                id="delete-confirm-email"
                value={typedEmail}
                onChange={(e) => setTypedEmail(e.target.value)}
                placeholder={email}
                autoComplete="off"
              />
            </div>

            {error && <p className="mt-2 text-sm text-danger">{error}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={close} disabled={isPending}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                loading={isPending}
                disabled={typedEmail !== email}
                onClick={handleDelete}
              >
                Delete Permanently
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
