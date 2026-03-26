/**
 * Trendyol GET /integration/sellers/{sellerId}/addresses yanıtını normalize eder.
 * @see https://developers.trendyol.com/docs/i%CC%87ade-ve-sevkiyat-adres-bilgileri-getsuppliersaddresses
 */

export type NormalizedTrendyolAddress = {
  id: string;
  /** Liste / dropdown için kısa etiket */
  label: string;
  isShipmentAddress: boolean;
  isReturningAddress: boolean;
  isInvoiceAddress: boolean;
  isDefault: boolean;
};

function pickId(row: Record<string, unknown>): string | null {
  const v =
    row.id ??
    row.addressId ??
    row.shipmentAddressId ??
    row.returningAddressId;
  if (v == null) return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v <= 0) return null;
    return String(Math.trunc(v));
  }
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n) && n > 0 && Number.isInteger(n)) {
    return String(Math.trunc(n));
  }
  return s;
}

function pickLabel(row: Record<string, unknown>): string {
  const cityLine = [
    row.cityName ?? row.city,
    row.districtName ?? row.district,
    row.countryName ?? row.country
  ]
    .filter((x) => typeof x === "string" && x.trim())
    .join(" / ");

  const parts = [
    row.fullAddress,
    row.addressLine,
    row.address,
    cityLine
  ];
  for (const p of parts) {
    if (typeof p === "string" && p.trim()) return p.trim().slice(0, 300);
  }
  const id = pickId(row);
  return id ? `Adres #${id}` : "Adres";
}

/** API bazen listeyi kökte, bazen data/content/result içinde döner */
function collectCandidateRoots(data: unknown): Record<string, unknown>[] {
  if (data == null || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  const out: Record<string, unknown>[] = [root];
  for (const k of ["data", "content", "result", "body", "payload"]) {
    const v = root[k];
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      out.push(v as Record<string, unknown>);
    }
  }
  return out;
}

const ADDRESS_LIST_KEYS = [
  "supplierAddresses",
  "addresses",
  "supplierAddressList",
  "supplierAddressesList",
  "SupplierAddresses",
  "Addresses"
] as const;

function findAddressArrayInRoot(
  r: Record<string, unknown>
): Record<string, unknown>[] | null {
  for (const key of ADDRESS_LIST_KEYS) {
    const v = r[key];
    if (Array.isArray(v)) {
      return v.filter(
        (item): item is Record<string, unknown> =>
          item != null && typeof item === "object" && !Array.isArray(item)
      );
    }
  }
  return null;
}

/** Çok katmanlı { data: { result: { supplierAddresses } } } gibi gövdeler için */
function deepFindAddressArray(
  data: unknown,
  maxDepth = 5
): Record<string, unknown>[] | null {
  function walk(node: unknown, depth: number): Record<string, unknown>[] | null {
    if (depth > maxDepth || node == null || typeof node !== "object") {
      return null;
    }
    const r = node as Record<string, unknown>;
    const direct = findAddressArrayInRoot(r);
    if (direct) return direct;
    for (const v of Object.values(r)) {
      if (v != null && typeof v === "object") {
        const inner = walk(v, depth + 1);
        if (inner) return inner;
      }
    }
    return null;
  }
  return walk(data, 0);
}

function pickDefaultAddressObject(
  candidates: Record<string, unknown>[],
  key: string
): Record<string, unknown> | undefined {
  for (const r of candidates) {
    const v = r[key];
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      if (pickId(o)) return o;
    }
  }
  return undefined;
}

/**
 * Ham API JSON → UI ve kayıt için düz liste.
 */
export function normalizeTrendyolAddressesResponse(data: unknown): {
  addresses: NormalizedTrendyolAddress[];
  defaultShipmentAddressId: string | null;
  defaultReturningAddressId: string | null;
} {
  if (data == null || typeof data !== "object") {
    return {
      addresses: [],
      defaultShipmentAddressId: null,
      defaultReturningAddressId: null
    };
  }

  const candidates = collectCandidateRoots(data);

  let rows: Record<string, unknown>[] = [];
  for (const r of candidates) {
    const found = findAddressArrayInRoot(r);
    if (found) {
      rows = found;
      break;
    }
  }

  if (rows.length === 0 && Array.isArray(data)) {
    rows = (data as unknown[]).filter(
      (item): item is Record<string, unknown> =>
        item != null && typeof item === "object" && !Array.isArray(item)
    );
  }

  if (rows.length === 0) {
    const deep = deepFindAddressArray(data);
    if (deep) rows = deep;
  }

  const addresses: NormalizedTrendyolAddress[] = [];

  for (const row of rows) {
    const id = pickId(row);
    if (!id) continue;

    const addressType = String(row.addressType ?? "").toLowerCase();
    addresses.push({
      id,
      label: pickLabel(row),
      isShipmentAddress:
        Boolean(row.isShipmentAddress) || addressType === "shipment",
      isReturningAddress:
        Boolean(row.isReturningAddress) || addressType === "returning",
      isInvoiceAddress:
        Boolean(row.isInvoiceAddress) || addressType === "invoice",
      isDefault: Boolean(row.isDefault)
    });
  }

  let defaultShipmentAddressId: string | null = null;
  let defaultReturningAddressId: string | null = null;

  const defShip = pickDefaultAddressObject(
    candidates,
    "defaultShipmentAddress"
  );
  const defRet = pickDefaultAddressObject(
    candidates,
    "defaultReturningAddress"
  );

  if (defShip) {
    const sid = pickId(defShip);
    if (sid) defaultShipmentAddressId = sid;
  }
  if (defRet) {
    const rid = pickId(defRet);
    if (rid) defaultReturningAddressId = rid;
  }

  if (!defaultShipmentAddressId) {
    const s = addresses.find((a) => a.isShipmentAddress && a.isDefault);
    if (s) defaultShipmentAddressId = s.id;
  }
  if (!defaultReturningAddressId) {
    const r = addresses.find((a) => a.isReturningAddress && a.isDefault);
    if (r) defaultReturningAddressId = r.id;
  }

  return {
    addresses,
    defaultShipmentAddressId,
    defaultReturningAddressId
  };
}
