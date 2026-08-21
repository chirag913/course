import Link from "next/link";
import { requireUser } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="sticky top-0 z-40 border-b border-ink-300 bg-ink-50/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            href="/dashboard"
            className="shrink-0 whitespace-nowrap font-display text-base font-bold tracking-tight text-ink-900 sm:text-lg"
          >
            Chirag Sharma<span className="text-brand-400">.</span>
          </Link>
          <nav className="flex items-center gap-3 sm:gap-6">
            <Link
              href="/dashboard"
              className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-widest2 text-ink-600 transition-colors hover:text-ink-900 sm:text-xs"
            >
              My Courses
            </Link>
            <Link
              href="/dashboard/profile"
              className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-widest2 text-ink-600 transition-colors hover:text-ink-900 sm:text-xs"
            >
              Profile
            </Link>
            <form action="/logout" method="post">
              <button className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-widest2 text-ink-500 transition-colors hover:text-ink-900 sm:text-xs">
                Log out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <p className="sr-only">Signed in as {user.email}</p>
        {children}
      </main>
    </div>
  );
}
