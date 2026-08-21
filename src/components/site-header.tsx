import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="text-lg font-bold tracking-tight text-ink-900">
          Learn
        </Link>
        <nav className="flex items-center gap-3">
          {user ? (
            <Link href={user.profile.role === "admin" ? "/admin" : "/dashboard"}>
              <Button size="sm" variant="outline">
                {user.profile.role === "admin" ? "Admin" : "My Courses"}
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-sm font-medium text-ink-600 hover:text-ink-900">
                Log in
              </Link>
              <Link href="/signup">
                <Button size="sm">Sign up</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
