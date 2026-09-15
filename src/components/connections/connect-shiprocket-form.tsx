"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { connectShiprocket } from "@/app/dashboard/mentorship/[slug]/connections/actions";

export function ConnectShiprocketForm({ enrollmentId }: { enrollmentId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await connectShiprocket(enrollmentId, email, password);
        setPassword("");
        setMessage("Shiprocket connected. You can sync shipment data whenever you are ready.");
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to connect to Shiprocket. Please check your API user credentials.");
      }
    });
  }

  return (
    <div className="mt-4">
      {!open ? (
        <Button onClick={() => setOpen(true)}>Connect Shiprocket</Button>
      ) : (
        <div className="space-y-3 rounded-md border border-ink-300 bg-ink-100/50 p-4">
          <div>
            <p className="font-medium text-ink-900">Connect Shiprocket</p>
            <p className="mt-1 text-sm text-ink-600">Create an API user in Shiprocket under Settings → API, then enter those credentials here.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="shiprocket-email">API user email</Label><Input id="shiprocket-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label htmlFor="shiprocket-password">API user password</Label><Input id="shiprocket-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          </div>
          <div className="flex items-center gap-2"><Button onClick={submit} loading={isPending} disabled={!email.trim() || !password}>Test connection</Button><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
          {message && <p className="text-sm text-success">{message}</p>}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
