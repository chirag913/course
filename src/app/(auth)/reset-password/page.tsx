"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <Card>
      <CardContent className="p-6">
        <h1 className="text-xl font-semibold text-ink-900">Reset your password</h1>
        <p className="mt-1 text-sm text-ink-500">We&apos;ll email you a link to set a new password.</p>

        {sent ? (
          <p className="mt-6 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
            Check your inbox for a password reset link.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <FieldError>{error ?? undefined}</FieldError>
            <Button type="submit" className="w-full" loading={loading}>
              Send reset link
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-ink-500">
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Back to login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
