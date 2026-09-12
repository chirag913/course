"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Drawer } from "./drawer";
import { MentorshipPaymentsPanel } from "@/components/admin/mentorship-payments-panel";
import type { MentorshipPayment } from "@/types/database";

export function PaymentsSummary({
  programId,
  enrollmentId,
  payments,
}: {
  programId: string;
  enrollmentId: string;
  payments: MentorshipPayment[];
}) {
  const [open, setOpen] = useState(false);

  const paidTotal = payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);
  const pendingPayments = payments.filter((p) => p.status !== "paid");
  const pendingTotal = pendingPayments.reduce((sum, p) => sum + p.amount, 0);
  const nextPayment = [...pendingPayments].sort((a, b) => (a.due_date < b.due_date ? -1 : 1))[0] ?? null;

  return (
    <div className="rounded-lg border border-ink-300 bg-ink-100 p-5">
      <p className="font-display text-lg font-semibold text-ink-900">Payments</p>
      <div className="mt-2 space-y-1 text-sm">
        <p className="text-success">{formatCurrency(paidTotal)} paid</p>
        {pendingTotal > 0 && <p className="text-ink-700">{formatCurrency(pendingTotal)} pending</p>}
      </div>
      {nextPayment && (
        <p className="mt-2 font-mono text-xs text-ink-500">Next payment: {formatDate(nextPayment.due_date)}</p>
      )}
      <Button variant="outline" size="sm" className="mt-3" onClick={() => setOpen(true)}>
        Manage Payments
      </Button>

      {open && (
        <Drawer title="Payments" onClose={() => setOpen(false)}>
          <MentorshipPaymentsPanel programId={programId} enrollmentId={enrollmentId} payments={payments} />
        </Drawer>
      )}
    </div>
  );
}
