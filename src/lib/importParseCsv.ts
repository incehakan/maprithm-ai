import Papa from "papaparse";
import {
  type ParsedImportRecord,
  capRecords,
  sanitizeRecord
} from "./importParseTypes";

export function parseCsvBuffer(buffer: Buffer): ParsedImportRecord[] {
  const text = buffer.toString("utf8");
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim()
  });

  const records: ParsedImportRecord[] = [];
  if (parsed.data?.length) {
    parsed.data.forEach((row, i) => {
      if (!row || typeof row !== "object") return;
      const raw = sanitizeRecord(row as Record<string, unknown>);
      if (Object.keys(raw).length === 0) return;
      const err = parsed.errors.find((e) => e.row === i);
      records.push({
        rowIndex: i,
        raw,
        errorMessage: err?.message
      });
    });
  }
  return capRecords(records);
}
