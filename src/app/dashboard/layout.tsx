import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { GraduationCap, User } from "lucide-react";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard" className="text-lg font-bold tracking-tight text-ink-900">
            Learn
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900"
            >
              <GraduationCap className="h-4 w-4" /> My Courses
            </Link>
            <Link
              href="/dashboard/profile"
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900"
            >
              <User className="h-4 w-4" /> Profile
            </Link>
            <form action="/logout" method="post">
              <button className="ml-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-500 hover:bg-ink-100 hover:text-ink-900">
                Log out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="sr-only">Signed in as {user.email}</p>
        {children}
      </main>
    </div>
  );
}
