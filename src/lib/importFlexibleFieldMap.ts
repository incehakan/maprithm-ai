/**
 * CSV / XLSX / XML gibi farklı sütun veya etiket adları için esnek alan eşleme.
 * Önce tam normal eşleşme, sonra güvenli kısmi eşleşme (XML varyantları için).
 */

export function normalizeFieldKey(key: string): string {
  return key
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s:._-]+/g, "");
}

/** Tüm anahtarları normalize edilmiş forma göre haritala (çakışmada ilk kazanır). */
export function buildNormalizedKeyMap(
  record: Record<string, unknown>
): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(record)) {
    const nk = normalizeFieldKey(k);
    if (!nk) continue;
    if (!map.has(nk)) map.set(nk, v);
  }
  return map;
}

/**
 * Alias listesine göre değer seç: önce birebir normalize eşleşme, sonra kısmi.
 */
export function pickStringByAliases(
  record: Record<string, unknown>,
  aliases: string[]
): string | undefined {
  const map = buildNormalizedKeyMap(record);

  for (const a of aliases) {
    const na = normalizeFieldKey(a);
    if (!na) continue;
    const v = map.get(na);
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }

  const aliasNorms = aliases.map((a) => normalizeFieldKey(a)).filter(Boolean);

  for (const na of aliasNorms) {
    if (na.length < 2) continue;
    for (const [nk, v] of map.entries()) {
      if (v == null) continue;
      const s = String(v).trim();
      if (!s) continue;
      if (nk === na) return s;
      if (nk.endsWith(na) || na.endsWith(nk)) return s;
      if (nk.includes(na) && na.length >= 4) return s;
    }
  }

  return undefined;
}

/**
 * Sayısal alan: alias eşleşmesi + tüm anahtarlarda fiyat benzeri desen (xml: ListPrice vb.).
 */
export function pickNumberByAliases(
  record: Record<string, unknown>,
  aliases: string[],
  mode: "float" | "int"
): number | undefined {
  const map = buildNormalizedKeyMap(record);

  for (const a of aliases) {
    const na = normalizeFieldKey(a);
    if (!na) continue;
    const v = map.get(na);
    const n = coerceNumber(v, mode);
    if (n != null) return n;
  }

  const priceHints = ["price", "fiyat", "cost", "amount", "listprice", "saleprice"];
  const stockHints = ["stock", "stok", "qty", "quantity", "adet", "inventory"];

  const hints = mode === "float" ? priceHints : stockHints;
  for (const [nk, v] of map.entries()) {
    for (const h of hints) {
      if (nk.includes(h) || h.includes(nk)) {
        const n = coerceNumber(v, mode);
        if (n != null) return n;
      }
    }
  }

  return undefined;
}

function coerceNumber(
  v: unknown,
  mode: "float" | "int"
): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) {
    return mode === "int" ? Math.round(v) : v;
  }
  const s = String(v).trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return undefined;
  if (mode === "int") {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : undefined;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}
