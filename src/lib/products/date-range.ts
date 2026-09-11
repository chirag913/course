// Reusable date-range resolution for product-level metrics (Part H). All
// ranges are inclusive [start, end] calendar dates in the server's local
// notion of "today" — consistent with how Phase B stores Shopify/Meta dates
// verbatim from the provider rather than reinterpreting them.
export type DateRangePreset = "today" | "yesterday" | "7d" | "14d" | "30d" | "custom";

export interface ResolvedDateRange {
  preset: DateRangePreset;
  start: string; // yyyy-mm-dd, inclusive
  end: string; // yyyy-mm-dd, inclusive
  label: string;
}

// 30 days matches Phase B's own default Meta insights ingestion window
// (DEFAULT_META_INSIGHTS_WINDOW_DAYS), so the dashboard's default range
// never looks emptier than the data actually pulled.
export const DEFAULT_DATE_RANGE_PRESET: DateRangePreset = "30d";

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

export function resolveDateRange(preset: DateRangePreset, custom?: { start: string; end: string }): ResolvedDateRange {
  const today = toIsoDate(daysAgo(0));

  switch (preset) {
    case "today":
      return { preset, start: today, end: today, label: "Today" };
    case "yesterday": {
      const y = toIsoDate(daysAgo(1));
      return { preset, start: y, end: y, label: "Yesterday" };
    }
    case "7d":
      return { preset, start: toIsoDate(daysAgo(6)), end: today, label: "Last 7 days" };
    case "14d":
      return { preset, start: toIsoDate(daysAgo(13)), end: today, label: "Last 14 days" };
    case "30d":
      return { preset, start: toIsoDate(daysAgo(29)), end: today, label: "Last 30 days" };
    case "custom": {
      if (!custom?.start || !custom?.end) {
        throw new Error("Custom date range requires both start and end dates.");
      }
      if (custom.start > custom.end) {
        throw new Error("Custom date range's start must not be after its end.");
      }
      return { preset, start: custom.start, end: custom.end, label: `${custom.start} – ${custom.end}` };
    }
  }
}
