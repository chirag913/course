// Converts a decimal amount (as Shopify/Meta return it — a numeric string
// like "19.99", or occasionally a number) into an integer minor-unit amount
// (paise/cents), matching the courses.price / mentorship_payments.amount
// convention. Assumes a 2-decimal-place currency — correct for INR/USD/EUR/
// GBP, the currencies this platform deals in. A zero-decimal currency (e.g.
// JPY) would be misconverted; see PHASE_B_DATA_INGESTION.md.
export function toMinorUnits(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}
