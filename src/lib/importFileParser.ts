/**
 * İçe aktarma: format seçici. Ayrıntılı parse: importParseCsv / importParseXlsx / importParseXml.
 */

import { detectSourceTypeFromFileName as detectFromName } from "./importSourceType";
import { parseCsvBuffer } from "./importParseCsv";
import { parseXlsxBuffer } from "./importParseXlsx";
import { parseXmlBuffer } from "./importParseXml";
import {
  type ParsedImportRecord,
  MAX_ROWS,
  sanitizeRecord,
  capRecords
} from "./importParseTypes";

export type { ParsedImportRecord } from "./importParseTypes";
export { MAX_ROWS, sanitizeRecord, capRecords } from "./importParseTypes";

export const detectSourceTypeFromFileName = detectFromName;

export function parseImportBuffer(
  buffer: Buffer,
  sourceType: "csv" | "xlsx" | "xml"
): ParsedImportRecord[] {
  switch (sourceType) {
    case "csv":
      return parseCsvBuffer(buffer);
    case "xlsx":
      return parseXlsxBuffer(buffer);
    case "xml":
      return parseXmlBuffer(buffer);
    default:
      return [];
  }
}
