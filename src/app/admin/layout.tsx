import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { LayoutDashboard, BookOpen, Users, Receipt, Settings } from "lucide-react";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/courses", label: "Courses", icon: BookOpen },
  { href: "/admin/students", label: "Students", icon: Users },
  { href: "/admin/orders", label: "Orders", icon: Receipt },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="flex min-h-screen bg-ink-50">
      <aside className="hidden w-56 shrink-0 border-r border-ink-300 bg-ink-100 sm:block">
        <div className="flex h-16 items-center px-5">
          <Link href="/admin" className="font-display text-lg font-bold tracking-tight text-ink-900">
            Chirag Sharma<span className="text-brand-400">.</span>
          </Link>
        </div>
        <p className="px-5 pb-3 font-mono text-[11px] uppercase tracking-widest2 text-ink-500">Admin</p>
        <nav className="space-y-0.5 px-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-200 hover:text-ink-900"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 border-t border-ink-300 px-3 pt-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-ink-500 transition-colors hover:bg-ink-200 hover:text-ink-900"
          >
            View site
          </Link>
          <form action="/logout" method="post">
            <button className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-ink-500 transition-colors hover:bg-ink-200 hover:text-ink-900">
              Log out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex-1">
        <header className="flex h-16 items-center justify-between border-b border-ink-300 bg-ink-100 px-4 sm:hidden">
          <span className="font-display font-bold text-ink-900">Chirag Sharma Admin</span>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
