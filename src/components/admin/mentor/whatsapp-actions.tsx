"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { formatDate, formatPrice } from "@/lib/utils";
import { WhatsAppCustomMessage } from "@/components/admin/whatsapp-custom-message";
import { MessageCircle, ChevronDown } from "lucide-react";
import type { MentorshipPayment, MentorshipCall, MentorshipTask } from "@/types/database";

interface DirectionNote {
  note: string;
}

export function WhatsAppActions({
  phone,
  studentName,
  topFocusTask,
  latestDirection,
  nextPendingPayment,
  upcomingCall,
}: {
  phone: string | null;
  studentName: string;
  topFocusTask: MentorshipTask | null;
  latestDirection: DirectionNote | null;
  nextPendingPayment: MentorshipPayment | null;
  upcomingCall: MentorshipCall | null;
}) {
  const [open, setOpen] = useState(false);
  const baseUrl = buildWhatsAppUrl(phone);

  if (!phone || !baseUrl) {
    return (
      <Button variant="outline" size="sm" disabled title="Add a WhatsApp number to enable this">
        <MessageCircle className="h-4 w-4" />
        WhatsApp
      </Button>
    );
  }

  const quickActions = [
    topFocusTask && {
      label: "Task reminder",
      url: buildWhatsAppUrl(
        phone,
        `Hey ${studentName}, quick reminder — your priority this week is ${topFocusTask.title}. Please get this done before our next call.`
      ),
    },
    latestDirection && {
      label: "Mentor direction",
      url: buildWhatsAppUrl(phone, `Hey ${studentName}, I've reviewed your account. Your main focus this week is: ${latestDirection.note}`),
    },
    nextPendingPayment && {
      label: "Payment reminder",
      url: buildWhatsAppUrl(
        phone,
        `Hey ${studentName}, your mentorship payment of ${formatPrice(nextPendingPayment.amount, nextPendingPayment.currency)} is pending.${
          nextPendingPayment.razorpay_link ? ` Payment link: ${nextPendingPayment.razorpay_link}` : ""
        }`
      ),
    },
    upcomingCall && {
      label: "Call reminder",
      url: buildWhatsAppUrl(
        phone,
        `Hey ${studentName}, reminder that we're scheduled for our mentorship call on ${formatDate(upcomingCall.scheduled_at)}, ${new Date(
          upcomingCall.scheduled_at
        ).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.`
      ),
    },
  ].filter((a): a is { label: string; url: string | null } => !!a);

  return (
    <div className="relative">
      <div className="flex">
        <a href={baseUrl} target="_blank" rel="noopener noreferrer">
          <Button size="sm" className="rounded-r-none">
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </Button>
        </a>
        <Button size="sm" className="rounded-l-none border-l border-ink-50/30 px-2" onClick={() => setOpen((v) => !v)}>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>

      {open && (
        <div className="absolute right-0 z-40 mt-1 w-72 rounded-md border border-ink-300 bg-ink-50 p-3 shadow-lg">
          <div className="flex flex-col gap-1">
            {quickActions.map(
              (action) =>
                action.url && (
                  <a key={action.label} href={action.url} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
                    <Button variant="ghost" size="sm" className="w-full justify-start">
                      {action.label}
                    </Button>
                  </a>
                )
            )}
          </div>
          <div className="mt-2 border-t border-ink-300 pt-2">
            <p className="mb-1 font-mono text-[10px] uppercase text-ink-500">Custom message</p>
            <WhatsAppCustomMessage phone={phone} studentName={studentName} />
          </div>
        </div>
      )}
    </div>
  );
}
