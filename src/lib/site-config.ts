// Business/legal details shown on the footer, legal pages, and contact
// page. Nothing here is invented. Values pulled from real, published
// sources (chiragsharma.co, the URLs Chirag gave directly) are hardcoded.
// Values that don't exist anywhere in the project (support email, refund
// window, registered business details) are read from env vars so they're
// configurable without a code change, and fall back to a clearly bracketed
// placeholder — never a made-up value — when unset. See SETUP.md for the
// full list of what needs to be filled in before Razorpay submission.
export const siteConfig = {
  brandName: "Chirag Sharma",
  platformName: "Learn with Chirag Sharma",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://learn.chiragsharma.co",
  mainSiteUrl: "https://chiragsharma.co",
  youtubeUrl: "https://www.youtube.com/chiragsharma",
  instagramUrl: "https://www.instagram.com/thechirag13/",

  // Not found anywhere in the project — configure via env var before
  // going live. Falls back to a visibly bracketed placeholder, never a
  // guessed address.
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "[SUPPORT EMAIL TO BE CONFIRMED]",

  // Registered operating entity, provided directly by Chirag.
  legalEntityName: process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME || "Chirag Digital Private Limited",
  businessAddress: process.env.NEXT_PUBLIC_BUSINESS_ADDRESS || null,
  gstin: process.env.NEXT_PUBLIC_GSTIN || null,

  // No refund window is defined anywhere in the project or checkout flow.
  // Deliberately left unset rather than invented — see REFUND_WINDOW_TEXT.
  refundWindowDays: process.env.NEXT_PUBLIC_REFUND_WINDOW_DAYS
    ? Number(process.env.NEXT_PUBLIC_REFUND_WINDOW_DAYS)
    : null,
};

export const REFUND_WINDOW_TEXT = siteConfig.refundWindowDays
  ? `${siteConfig.refundWindowDays} days`
  : "[REFUND WINDOW TO BE CONFIRMED]";
