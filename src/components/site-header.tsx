import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b border-ink-300 bg-ink-50/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="shrink-0 whitespace-nowrap font-display text-base font-bold tracking-tight text-ink-900 sm:text-lg"
        >
          Chirag Sharma<span className="text-brand-400">.</span>
        </Link>
        <nav className="flex items-center gap-3 sm:gap-5">
          <Link
            href="/"
            className="hidden whitespace-nowrap text-xs font-semibold uppercase tracking-widest2 text-ink-600 transition-colors hover:text-ink-900 sm:inline"
          >
            Courses
          </Link>
          {user ? (
            <>
              <Link
                href={user.profile.role === "admin" ? "/admin" : "/dashboard/profile"}
                className="hidden whitespace-nowrap text-xs font-semibold uppercase tracking-widest2 text-ink-600 transition-colors hover:text-ink-900 sm:inline"
              >
                {user.profile.role === "admin" ? "Admin" : "Account"}
              </Link>
              <Link href={user.profile.role === "admin" ? "/admin" : "/dashboard"}>
                <Button size="sm" variant="outline">
                  {user.profile.role === "admin" ? "Dashboard" : "My Courses"}
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="whitespace-nowrap text-xs font-semibold uppercase tracking-widest2 text-ink-600 transition-colors hover:text-ink-900"
              >
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
