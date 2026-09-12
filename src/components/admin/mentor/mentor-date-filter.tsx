"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { DateRangePreset } from "@/lib/products/date-range";

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "7D" },
  { value: "14d", label: "14D" },
  { value: "30d", label: "30D" },
];

// Admin-specific date filter — kept separate from
// components/products/date-range-picker.tsx (the student-facing one) so
// adding Custom-range support here never changes that page's behavior.
export function MentorDateFilter({ current, customStart, customEnd }: { current: DateRangePreset; customStart?: string; customEnd?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showCustom, setShowCustom] = useState(current === "custom");
  const [start, setStart] = useState(customStart ?? "");
  const [end, setEnd] = useState(customEnd ?? "");

  function setPreset(preset: DateRangePreset) {
    setShowCustom(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", preset);
    params.delete("start");
    params.delete("end");
    router.push(`${pathname}?${params.toString()}`);
  }

  function applyCustom() {
    if (!start || !end) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", "custom");
    params.set("start", start);
    params.set("end", end);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border border-ink-300 p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPreset(p.value)}
            className={cn(
              "rounded px-3 py-1.5 text-sm font-medium transition-colors",
              current === p.value ? "bg-brand-400 text-ink-50" : "text-ink-600 hover:bg-ink-200"
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setShowCustom((v) => !v)}
          className={cn(
            "rounded px-3 py-1.5 text-sm font-medium transition-colors",
            current === "custom" ? "bg-brand-400 text-ink-50" : "text-ink-600 hover:bg-ink-200"
          )}
        >
          Custom
        </button>
      </div>

      {showCustom && (
        <div className="flex items-center gap-2">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-9 w-auto" />
          <span className="text-ink-500">→</span>
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9 w-auto" />
          <Button size="sm" onClick={applyCustom} disabled={!start || !end}>
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}
