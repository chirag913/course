import type { CanonicalShippingStatus } from "@/types/database";

// Deterministic, conservative status normalization. An ambiguous or
// unrecognized raw status is NEVER guessed into one of the four meaningful
// canonical states — it becomes "unknown" (recognizable text, just not one
// we trust) or "needs_review" (blank/missing), so it can never silently
// pollute delivery/RTO/NDR rates. See PHASE_D_ECONOMICS_SHIPPING.md.
const DELIVERED_PATTERNS = [/^delivered$/i, /^delivery\s*done$/i];
const RTO_PATTERNS = [/^rto$/i, /^r\.?t\.?o\.?$/i, /^return(ed)?\s*to\s*origin$/i, /^returned(\s*to\s*(seller|sender))?$/i, /^return$/i];
const NDR_PATTERNS = [/^ndr$/i, /^non[\s-]?delivery(\s*report)?$/i, /^delivery\s*attempt(ed)?\s*failed$/i, /^undelivered$/i];
const SHIPPED_PATTERNS = [/^shipped$/i, /^in[\s-]?transit$/i, /^dispatched$/i, /^out\s*for\s*delivery$/i, /^picked\s*up$/i];

export function normalizeShippingStatus(rawStatus: string): CanonicalShippingStatus {
  const trimmed = rawStatus.trim();
  if (!trimmed) return "needs_review";
  if (DELIVERED_PATTERNS.some((p) => p.test(trimmed))) return "delivered";
  if (RTO_PATTERNS.some((p) => p.test(trimmed))) return "RTO";
  if (NDR_PATTERNS.some((p) => p.test(trimmed))) return "NDR";
  if (SHIPPED_PATTERNS.some((p) => p.test(trimmed))) return "shipped";
  return "unknown"; // recognizable text, but not one we're confident about
}
