import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "brand";

const toneClasses: Record<Tone, string> = {
  neutral: "border-ink-400 text-ink-500",
  success: "border-success/40 text-success",
  warning: "border-danger/40 text-danger",
  brand: "border-brand-400/50 text-brand-300",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wide",
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}
