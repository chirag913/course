import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ProgramRouteContext, ProgramTypeAdapter, UserProgram } from "@/lib/programs/types";
import { ProgramTypeBadge } from "./program-type-badge";

interface ProgramCardProps {
  program: UserProgram;
  adapter: ProgramTypeAdapter;
  routeContext?: ProgramRouteContext;
  featured?: boolean;
}

function renderProgressPercent(context?: ProgramRouteContext) {
  if (typeof context?.progressPercent !== "number") return null;

  return (
    <p className="font-mono text-xs text-ink-500">{context.progressPercent}% COMPLETE</p>
  );
}

export function ProgramCard({ program, adapter, routeContext, featured = false }: ProgramCardProps) {
  const href = adapter.getDashboardRoute(program, routeContext);
  const metadata = adapter.getPresentationMetadata(program, routeContext);

  if (!featured) {
    return (
      <Link
        href={href}
        className="group flex items-center gap-4 py-4 transition-colors hover:bg-ink-100/60"
      >
        <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md bg-ink-100">
          {program.thumbnailUrl ? (
            <Image src={program.thumbnailUrl} alt={program.title} fill className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-ink-500">No thumbnail</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] tracking-[0.15em] text-ink-500">{metadata.typeLabel}</p>
          <h3 className="truncate font-display font-semibold text-ink-900">{program.title}</h3>
          <div className="mt-1 flex items-center gap-2">
            {program.subtitle ? <p className="truncate text-sm text-ink-500">{program.subtitle}</p> : null}
            <ProgramTypeBadge label={metadata.typeLabel} tone={metadata.badgeTone} />
          </div>
          {typeof routeContext?.progressPercent === "number" && (
            <p className="font-mono text-xs text-ink-500">{routeContext.progressPercent}% COMPLETE</p>
          )}
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-ink-500 transition-transform group-hover:translate-x-1" />
      </Link>
    );
  }

  return (
    <div className="mt-12">
      <p className="eyebrow">Continue Learning</p>
      <div className="mt-4 border-t border-ink-300 pt-6">
        <div className="grid gap-6 sm:grid-cols-[220px_1fr] sm:items-center">
          <div className="relative aspect-video w-full overflow-hidden rounded-md bg-ink-100 sm:aspect-square">
            {program.thumbnailUrl ? (
              <Image src={program.thumbnailUrl} alt={program.title} fill className="object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-ink-500">No thumbnail</div>
            )}
          </div>
          <div>
            <p className="font-mono text-[10px] tracking-[0.15em] text-ink-500">{metadata.typeLabel}</p>
            <h2 className="font-display text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
              {program.title}
            </h2>
            {program.subtitle ? <p className="mt-2 max-w-lg text-ink-500">{program.subtitle}</p> : null}
            <div className="mt-3 flex items-center gap-2">
              <ProgramTypeBadge label={metadata.typeLabel} tone={metadata.badgeTone} />
              <span className="font-mono text-xs text-ink-500">
                {formatPrice(program.price, program.currency)}
              </span>
            </div>
            <div className="mt-5 flex items-center gap-3">
              {typeof routeContext?.progressPercent === "number" ? (
                <>
                  <div className="h-px w-24 overflow-hidden bg-ink-300">
                    <div className="h-full bg-brand-400" style={{ width: `${routeContext.progressPercent}%` }} />
                  </div>
                  {renderProgressPercent(routeContext)}
                </>
              ) : (
                <p className="font-mono text-xs text-ink-500">Program details</p>
              )}
            </div>
            <Link href={href}>
              <Button className="mt-6">
                {metadata.actionLabel}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

