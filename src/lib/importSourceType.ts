/** Sadece dosya adına göre kaynak tipi — istemci ve sunucuda güvenle kullanılabilir. */

export function detectSourceTypeFromFileName(
  fileName: string
): "csv" | "xlsx" | "xml" | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "xlsx";
  if (lower.endsWith(".xml")) return "xml";
  return null;
}
