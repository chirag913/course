"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

// Manual only: this just builds a wa.me link from whatever the admin types
// here. Nothing is ever sent by this app — clicking "Open in WhatsApp"
// opens WhatsApp itself, where the admin reviews and presses Send.
export function WhatsAppCustomMessage({ phone, studentName }: { phone: string; studentName: string }) {
  const [message, setMessage] = useState(`Hey ${studentName}, `);
  const url = buildWhatsAppUrl(phone, message);

  return (
    <div className="grid gap-2">
      <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} />
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="self-start">
          <Button type="button" variant="outline" size="sm">
            Open in WhatsApp
          </Button>
        </a>
      ) : (
        <p className="text-xs text-ink-500">Write a message to enable the link.</p>
      )}
    </div>
  );
}
