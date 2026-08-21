import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

export interface SessionUser {
  id: string;
  email: string | null;
  profile: Profile;
}

// Returns the signed-in user + profile, or null. Use in pages/layouts that
// render differently for guests vs. signed-in users.
export async function getCurrentUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return { id: user.id, email: user.email ?? null, profile };
}

// Redirects to /login if not signed in. Use at the top of protected pages.
export async function requireUser(redirectTo = "/login"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(redirectTo);
  return user;
}

// Redirects non-admins away. Use at the top of every /admin page.
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.profile.role !== "admin") redirect("/dashboard");
  return user;
}
