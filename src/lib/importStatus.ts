type ImportLike = {
  usageStatus?: string | null;
  [key: string]: unknown;
};

export function isImportActive(importJob: ImportLike | null | undefined): boolean {
  return (importJob?.usageStatus ?? "active").toLowerCase() === "active";
}

export function isImportUsable(importJob: ImportLike | null | undefined): boolean {
  return isImportActive(importJob);
}
