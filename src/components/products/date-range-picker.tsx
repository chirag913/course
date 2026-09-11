"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { DateRangePreset } from "@/lib/products/date-range";

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "7D" },
  { value: "14d", label: "14D" },
  { value: "30d", label: "30D" },
];

export function DateRangePicker({ current }: { current: DateRangePreset }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setRange(preset: DateRangePreset) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", preset);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="inline-flex rounded-md border border-ink-300 p-0.5">
      {PRESETS.map((p) => (
        <button
          key={p.value}
          onClick={() => setRange(p.value)}
          className={cn(
            "rounded px-3 py-1.5 text-sm font-medium transition-colors",
            current === p.value ? "bg-brand-400 text-ink-50" : "text-ink-600 hover:bg-ink-200"
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
