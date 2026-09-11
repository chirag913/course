import { Badge } from "@/components/ui/badge";

interface ProgramTypeBadgeProps {
  label: string;
  tone: "brand" | "neutral" | "success" | "warning";
}

export function ProgramTypeBadge({ label, tone }: ProgramTypeBadgeProps) {
  return (
    <Badge tone={tone} className="text-[10px] tracking-[0.25em]">
      {label}
    </Badge>
  );
}

