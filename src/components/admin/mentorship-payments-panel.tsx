"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/input";
import { formatDate, formatPrice } from "@/lib/utils";
import {
  addMentorshipPayment,
  updateMentorshipPayment,
  markMentorshipPaymentPaid,
} from "@/app/admin/mentorship/[programId]/students/[enrollmentId]/actions";
import type { MentorshipPayment, MentorshipPaymentStatus } from "@/types/database";

const STATUS_TONE: Record<MentorshipPaymentStatus, "success" | "warning" | "neutral"> = {
  paid: "success",
  pending: "neutral",
  overdue: "warning",
};

function PaymentEditForm({
  programId,
  enrollmentId,
  payment,
  onDone,
}: {
  programId: string;
  enrollmentId: string;
  payment: MentorshipPayment;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          setError(null);
          try {
            await updateMentorshipPayment(programId, enrollmentId, formData);
            router.refresh();
            onDone();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save payment.");
          }
        })
      }
      className="grid gap-3 border-t border-ink-300 pt-3"
    >
      <input type="hidden" name="payment_id" value={payment.id} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Amount (₹)</Label>
          <Input name="amount" type="number" min={0} step="1" defaultValue={payment.amount / 100} required />
        </div>
        <div>
          <Label>Due date</Label>
          <Input name="due_date" type="date" defaultValue={payment.due_date} required />
        </div>
        <div>
          <Label>Status</Label>
          <select
            name="status"
            defaultValue={payment.status}
            className="h-10 w-full rounded-md border border-ink-300 bg-ink-100 px-3 text-sm text-ink-900"
          >
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Razorpay Payment Link</Label>
          <Input name="razorpay_link" defaultValue={payment.razorpay_link ?? ""} placeholder="https://rzp.io/..." />
        </div>
        <div>
          <Label>Paid date</Label>
          <Input name="paid_date" type="date" defaultValue={payment.paid_date ?? ""} />
        </div>
      </div>
      <Textarea name="notes" rows={2} defaultValue={payment.notes ?? ""} placeholder="Notes" />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" loading={isPending}>
          Save payment
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function AddPaymentForm({ programId, enrollmentId }: { programId: string; enrollmentId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        + Add Payment
      </Button>
    );
  }

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          setError(null);
          try {
            await addMentorshipPayment(programId, enrollmentId, formData);
            router.refresh();
            setOpen(false);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not add payment.");
          }
        })
      }
      className="grid gap-3 border-t border-ink-300 pt-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Amount (₹)</Label>
          <Input name="amount" type="number" min={0} step="1" required />
        </div>
        <div>
          <Label>Due date</Label>
          <Input name="due_date" type="date" required />
        </div>
      </div>
      <Input name="razorpay_link" placeholder="Razorpay Payment Link (optional)" />
      <Textarea name="notes" rows={2} placeholder="Notes (optional)" />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" loading={isPending}>
          Add payment
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function MentorshipPaymentsPanel({
  programId,
  enrollmentId,
  payments,
}: {
  programId: string;
  enrollmentId: string;
  payments: MentorshipPayment[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="border border-ink-300 p-5">
      <h2 className="font-display text-lg font-semibold text-ink-900">Payments</h2>

      <div className="mt-4 space-y-3">
        {payments.length === 0 ? (
          <p className="text-sm text-ink-500">No payments recorded yet.</p>
        ) : (
          payments.map((payment) =>
            editingId === payment.id ? (
              <PaymentEditForm
                key={payment.id}
                programId={programId}
                enrollmentId={enrollmentId}
                payment={payment}
                onDone={() => setEditingId(null)}
              />
            ) : (
              <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-300 pt-3 first:border-t-0 first:pt-0">
                <div>
                  <p className="font-medium text-ink-900">{formatPrice(payment.amount, payment.currency)}</p>
                  <p className="font-mono text-xs text-ink-500">
                    Due {formatDate(payment.due_date)}
                    {payment.paid_date ? ` · Paid ${formatDate(payment.paid_date)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[payment.status]}>{payment.status}</Badge>
                  {payment.status !== "paid" && (
                    <Button
                      variant="outline"
                      size="sm"
                      loading={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          await markMentorshipPaymentPaid(programId, enrollmentId, payment.id);
                          router.refresh();
                        })
                      }
                    >
                      Mark Paid
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(payment.id)}>
                    Edit
                  </Button>
                </div>
              </div>
            )
          )
        )}
      </div>

      <div className="mt-4">
        <AddPaymentForm programId={programId} enrollmentId={enrollmentId} />
      </div>
    </div>
  );
}
