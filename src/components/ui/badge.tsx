import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "brand";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-700",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-800",
  brand: "bg-brand-100 text-brand-700",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}
