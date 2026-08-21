import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-50 px-4 py-12">
      <Link href="/" className="mb-8 text-lg font-bold tracking-tight text-ink-900">
        Learn
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
