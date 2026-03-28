/**
 * Trendyol shipment package lifecycle: durum geçişleri, split sezimi, timeline.
 */

export type PackageLifecycleStatus =
  | "Created"
  | "Picking"
  | "Invoiced"
  | "Shipped"
  | "Cancelled"
  | "Delivered"
  | "UnDelivered"
  | "Returned"
  | "AtCollectionPoint"
  | "UnPacked"
  | "UnSupplied"
  | string;

/** API / dokümantasyon varyantlarını tek forma çeker */
export function normalizePackageStatusKey(status: string | null | undefined): string | null {
  if (status == null || String(status).trim() === "") return null;
  const s = String(status).trim();
  const map: Record<string, string> = {
    Unsupplied: "UnSupplied",
    UnDelivered: "UnDelivered",
    Undelivered: "UnDelivered"
  };
  return map[s] ?? s;
}

/** Geçerli ileri geçişler (terminal durumdan çıkış yok; örnek: Delivered -> Picking yasak) */
const ALLOWED_TRANSITIONS: Record<string, Set<string>> = {
  Created: new Set(["Picking", "Cancelled", "UnSupplied"]),
  Picking: new Set(["Invoiced", "Cancelled", "UnSupplied"]),
  Invoiced: new Set(["Shipped", "Cancelled", "UnSupplied"]),
  Shipped: new Set(["Delivered", "UnDelivered", "AtCollectionPoint", "Returned", "Cancelled"]),
  AtCollectionPoint: new Set(["Delivered", "UnDelivered", "Returned"]),
  UnPacked: new Set(["Picking", "Cancelled", "UnSupplied", "Shipped"]),
  UnDelivered: new Set(["Shipped", "Returned", "Cancelled"]),
  Delivered: new Set(["Returned"]),
  Returned: new Set([]),
  Cancelled: new Set([]),
  UnSupplied: new Set([])
};

export type TransitionKind = "same" | "initial" | "valid" | "invalid" | "unknown";

export function isValidPackageStatusTransition(
  from: string | null | undefined,
  to: string | null | undefined
): boolean {
  const a = normalizePackageStatusKey(from);
  const b = normalizePackageStatusKey(to);
  if (a === b) return true;
  if (b == null) return true;
  if (a == null) return true;
  const allowed = ALLOWED_TRANSITIONS[a];
  if (!allowed) return false;
  return allowed.has(b);
}

export function classifyPackageStatusTransition(
  from: string | null | undefined,
  to: string | null | undefined
): { kind: TransitionKind; note: string } {
  const a = normalizePackageStatusKey(from);
  const b = normalizePackageStatusKey(to);
  if (a === b) {
    return { kind: "same", note: "Durum değişmedi." };
  }
  if (a == null && b != null) {
    return { kind: "initial", note: "İlk statü atandı." };
  }
  if (a != null && b == null) {
    return { kind: "unknown", note: "Statü kaldırıldı (beklenmeyen)." };
  }
  if (a != null && b != null) {
    if (isValidPackageStatusTransition(a, b)) {
      return { kind: "valid", note: `Geçerli geçiş: ${a} → ${b}` };
    }
    return { kind: "invalid", note: `Dokümana aykırı olabilecek geçiş: ${a} → ${b}` };
  }
  return { kind: "unknown", note: "Statü bilinmiyor." };
}

export function detectPackageLifecycleChange(
  existing: { packageStatus: string | null },
  incoming: { packageStatus: string | null }
): {
  statusChanged: boolean;
  previousStatus: string | null;
  nextStatus: string | null;
  transition: ReturnType<typeof classifyPackageStatusTransition>;
} {
  const prev = normalizePackageStatusKey(existing.packageStatus);
  const next = normalizePackageStatusKey(incoming.packageStatus);
  const statusChanged = prev !== next;
  return {
    statusChanged,
    previousStatus: existing.packageStatus,
    nextStatus: incoming.packageStatus,
    transition: classifyPackageStatusTransition(prev, next)
  };
}

export type LineRefForSplit = {
  lineId: string | null;
  stockCode: string | null;
  barcode: string | null;
  quantity: number;
};

export function lineFingerprint(line: LineRefForSplit): string {
  const lid = line.lineId?.trim() ?? "";
  if (lid !== "") return `id:${lid}`;
  const sc = line.stockCode?.trim() ?? "";
  const bc = line.barcode?.trim() ?? "";
  return `f:${sc}|${bc}|${line.quantity}`;
}

export type ExistingPackageForSplit = {
  id: string;
  shipmentPackageId: string;
  lines: LineRefForSplit[];
};

/**
 * Aynı orderNumber altında yeni shipmentPackageId geldiğinde:
 * gelen satır kümesi mevcut bir paketin satırlarının gerçek alt kümesi ise split çocuğu kabul edilir.
 */
export function detectSplitPackage(
  existingOrders: ExistingPackageForSplit[],
  incoming: { shipmentPackageId: string; lines: LineRefForSplit[] }
): { parentId: string; parentShipmentPackageId: string } | null {
  if (existingOrders.length === 0) return null;
  const incomingKeys = new Set(incoming.lines.map(lineFingerprint));
  if (incomingKeys.size === 0) return null;

  let best: { id: string; shipmentPackageId: string; score: number } | null = null;

  for (const ex of existingOrders) {
    if (ex.shipmentPackageId === incoming.shipmentPackageId) continue;
    const exKeys = new Set(ex.lines.map(lineFingerprint));
    if (exKeys.size === 0) continue;
    let subset = true;
    for (const k of incomingKeys) {
      if (!exKeys.has(k)) {
        subset = false;
        break;
      }
    }
    if (!subset) continue;
    if (exKeys.size <= incomingKeys.size) continue;

    const score = exKeys.size;
    if (!best || score > best.score) {
      best = { id: ex.id, shipmentPackageId: ex.shipmentPackageId, score };
    }
  }

  return best ? { parentId: best.id, parentShipmentPackageId: best.shipmentPackageId } : null;
}

export type TimelineEventInput = {
  id: string;
  action: string;
  message: string;
  createdAt: Date;
  previousStatus?: string | null;
  nextStatus?: string | null;
  relatedShipmentPackageId?: string | null;
};

export type OrderTimelineEntry = TimelineEventInput & {
  transitionNote?: string;
  kind?: TransitionKind;
};

export function buildOrderTimeline(
  events: TimelineEventInput[],
  options?: { maxItems?: number }
): OrderTimelineEntry[] {
  const maxItems = options?.maxItems ?? 80;
  const sorted = [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const slice = sorted.slice(-maxItems);
  return slice.map((e) => {
    if (e.action === "PACKAGE_STATUS_CHANGED") {
      const t = classifyPackageStatusTransition(e.previousStatus, e.nextStatus);
      return { ...e, transitionNote: t.note, kind: t.kind };
    }
    return { ...e };
  });
}
