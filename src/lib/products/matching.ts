// Deterministic (non-LLM) matching between provider records and catalog
// products. See PHASE_C_PRODUCT_INTELLIGENCE.md "Automatic matching rules"
// for the full rationale. Pure functions only — no DB/network access — so
// they're trivially unit-testable and reusable from both discovery
// (Part F) and the manual-mapping UI's suggestion list.
import type { ProductMatchConfidence } from "@/types/database";

// Common size/pack/unit tokens that distinguish a *variant* of a product
// from a genuinely different product (e.g. "Premium Hair Serum - 100ml"
// should normalize to the same thing as "Premium Hair Serum"). Deliberately
// conservative — only strips clearly-numeric-unit patterns, never whole
// words, so it can't accidentally collapse two different products that
// happen to share a common word.
const SIZE_TOKEN_RE = /\b\d+(\.\d+)?\s?(ml|l|kg|g|mg|pcs?|pack|piece|pieces|oz|inch|in|cm|mm|pair|set)\b/g;

export function normalizeProductName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(SIZE_TOKEN_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(input: string): Set<string> {
  return new Set(normalizeProductName(input).split(" ").filter(Boolean));
}

// Jaccard similarity of the two strings' normalized word sets: |A∩B| / |A∪B|.
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Thresholds are intentionally conservative — a false positive mapping
// (wrongly attributing spend/revenue to a product) is worse than leaving
// something unmapped for a human to confirm. Only an exact match after
// normalization is ever "high" (auto-appliable); below LOW_THRESHOLD we
// don't even suggest a match at all.
const MEDIUM_THRESHOLD = 0.6;
const LOW_THRESHOLD = 0.3;

export function confidenceForNames(candidateName: string, catalogName: string): ProductMatchConfidence | null {
  const normCandidate = normalizeProductName(candidateName);
  const normCatalog = normalizeProductName(catalogName);
  if (normCandidate.length === 0 || normCatalog.length === 0) return null;
  if (normCandidate === normCatalog) return "high";

  const score = jaccard(tokenSet(candidateName), tokenSet(catalogName));
  if (score >= MEDIUM_THRESHOLD) return "medium";
  if (score >= LOW_THRESHOLD) return "low";
  return null;
}

export interface MatchSuggestion<TId> {
  candidateId: TId;
  catalogProductId: string;
  confidence: ProductMatchConfidence;
}

// Matches one Shopify product's title against every candidate catalog
// product, returning the single best suggestion (if any clears the LOW
// floor). Used by both product discovery (Part F) and the "Unmapped"
// suggestion list (Part L).
export function bestCatalogMatchForShopifyProduct(
  shopifyTitle: string,
  catalogProducts: { id: string; name: string }[]
): { catalogProductId: string; confidence: ProductMatchConfidence } | null {
  let best: { catalogProductId: string; confidence: ProductMatchConfidence } | null = null;
  const rank: Record<ProductMatchConfidence, number> = { high: 3, medium: 2, low: 1 };

  for (const product of catalogProducts) {
    const confidence = confidenceForNames(shopifyTitle, product.name);
    if (!confidence) continue;
    if (!best || rank[confidence] > rank[best.confidence]) {
      best = { catalogProductId: product.id, confidence };
    }
  }
  return best;
}

// Matches a Meta ad against a catalog product using whichever of ad name /
// ad set name / campaign name scores best — we don't trust any single one
// of these to be reliably product-descriptive, so we take the best signal
// available rather than requiring all three to agree.
export function bestConfidenceForMetaEntity(
  names: { adName?: string | null; adSetName?: string | null; campaignName?: string | null },
  catalogName: string
): ProductMatchConfidence | null {
  const candidates = [names.adName, names.adSetName, names.campaignName].filter(
    (n): n is string => !!n && n.trim().length > 0
  );
  const rank: Record<ProductMatchConfidence, number> = { high: 3, medium: 2, low: 1 };
  let best: ProductMatchConfidence | null = null;
  for (const candidate of candidates) {
    const confidence = confidenceForNames(candidate, catalogName);
    if (confidence && (!best || rank[confidence] > rank[best])) best = confidence;
  }
  return best;
}
