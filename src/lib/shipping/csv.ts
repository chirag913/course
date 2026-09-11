// A small, dependency-free RFC4180-ish CSV parser. Pure string parsing, no
// Node-specific APIs — runs identically in the browser (for the column-
// mapping preview step) and on the server (for the actual import), so
// there's exactly one implementation to get right and test.
//
// Handles: quoted fields (including embedded commas and newlines),
// escaped quotes (""), both \r\n and \n line endings, empty rows (skipped),
// and ragged rows (fewer cells than headers -> missing ones become "";
// extra cells beyond the header count are dropped rather than crashing).

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

function parseRecords(text: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  function endField() {
    record.push(field);
    field = "";
  }
  function endRecord() {
    endField();
    records.push(record);
    record = [];
  }

  while (i < len) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      endField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      // Swallow bare \r and \r\n alike; the following \n (if any) is consumed next iteration.
      if (text[i + 1] === "\n") i += 1;
      endRecord();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      endRecord();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // Final field/record, if the file doesn't end with a newline.
  if (field.length > 0 || record.length > 0) {
    endRecord();
  }

  return records;
}

export function parseCsv(text: string): ParsedCsv {
  const records = parseRecords(text).filter((r) => !(r.length === 1 && (r[0] ?? "").trim() === "")); // drop fully-empty rows
  if (records.length === 0) return { headers: [], rows: [] };

  const headerRecord = records[0] ?? [];
  const headers = headerRecord.map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let r = 1; r < records.length; r += 1) {
    const record = records[r] ?? [];
    if (record.length === 1 && (record[0] ?? "").trim() === "") continue; // skip empty row
    const row: Record<string, string> = {};
    for (let c = 0; c < headers.length; c += 1) {
      const header = headers[c];
      if (header === undefined) continue;
      row[header] = (record[c] ?? "").trim();
    }
    rows.push(row);
  }

  return { headers, rows };
}

// Best-effort auto-detection so a well-formed CSV doesn't force the student
// through a manual mapping step every time — but this only ever produces a
// *suggestion* for the picker UI to pre-select; it never silently commits
// to a mapping. See PHASE_D_ECONOMICS_SHIPPING.md "CSV column mapping."
const ORDER_HEADER_PATTERNS = [/^order\s*id$/i, /^order\s*number$/i, /^order$/i, /^order\s*ref(erence)?$/i, /^awb$/i];
const STATUS_HEADER_PATTERNS = [/^status$/i, /^shipment\s*status$/i, /^delivery\s*status$/i, /^current\s*status$/i];

export function guessColumn(headers: string[], patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = headers.find((h) => pattern.test(h.trim()));
    if (match) return match;
  }
  return null;
}

export function guessOrderColumn(headers: string[]): string | null {
  return guessColumn(headers, ORDER_HEADER_PATTERNS);
}

export function guessStatusColumn(headers: string[]): string | null {
  return guessColumn(headers, STATUS_HEADER_PATTERNS);
}
