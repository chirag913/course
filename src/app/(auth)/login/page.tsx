"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setError(error.message === "Invalid login credentials" ? "Incorrect email or password." : error.message);
      return;
    }

    const next = searchParams.get("next");
    if (next) {
      router.push(next);
    } else {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();
      router.push(profile?.role === "admin" ? "/admin" : "/dashboard");
    }
    setLoading(false);
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="p-6">
        <h1 className="text-xl font-semibold text-ink-900">Log in</h1>
        <p className="mt-1 text-sm text-ink-500">Welcome back. Continue where you left off.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/reset-password" className="text-xs text-brand-600 hover:underline">
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <FieldError>{error ?? undefined}</FieldError>
          <Button type="submit" className="w-full" loading={loading}>
            Log in
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-500">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-brand-600 hover:underline">
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
