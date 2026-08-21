import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-ink-300">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-xs text-ink-500">
          © {new Date().getFullYear()} Chirag Sharma. All rights reserved.
        </p>
        <div className="flex items-center gap-5">
          <Link
            href="https://chiragsharma.co"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-ink-500 transition-colors hover:text-ink-900"
          >
            chiragsharma.co
          </Link>
          <Link
            href="https://www.youtube.com/chiragsharma"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-ink-500 transition-colors hover:text-ink-900"
          >
            YouTube
          </Link>
          <Link
            href="https://www.instagram.com/thechirag13/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-ink-500 transition-colors hover:text-ink-900"
          >
            Instagram
          </Link>
        </div>
        <p className="text-xs text-ink-500">Payments secured by Razorpay</p>
      </div>
    </footer>
  );
}
