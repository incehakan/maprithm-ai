import * as XLSX from "xlsx";
import {
  type ParsedImportRecord,
  capRecords,
  sanitizeRecord
} from "./importParseTypes";

export function parseXlsxBuffer(buffer: Buffer): ParsedImportRecord[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false
  });
  const records: ParsedImportRecord[] = [];
  let idx = 0;
  for (const row of rows) {
    const raw = sanitizeRecord(row);
    if (Object.keys(raw).length === 0) continue;
    const allEmpty = Object.values(raw).every(
      (v) => v == null || String(v).trim() === ""
    );
    if (allEmpty) continue;
    records.push({ rowIndex: idx, raw });
    idx += 1;
  }
  return capRecords(records);
}
