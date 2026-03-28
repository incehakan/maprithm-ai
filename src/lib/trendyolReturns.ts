import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { trendyolFetch, trendyolPostJson, trendyolPutJson } from "@/lib/trendyolFetch";
import { getTrendyolStorefrontCode } from "@/lib/trendyolShipmentPackages";

export type TrendyolClaimsPage = {
  content?: unknown[];
  totalPages?: number;
  page?: number;
  size?: number;
  totalElements?: number;
};

export function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

async function getSellerIdForStore(storeId: string): Promise<string> {
  const conn = await prisma.marketplaceConnection.findFirst({
    where: { storeId, platform: "trendyol", isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { sellerId: true, userId: true }
  });
  if (!conn?.sellerId?.trim()) throw new Error("Trendyol sellerId yok.");
  return conn.sellerId.trim();
}

async function getActor(storeId: string) {
  const conn = await prisma.marketplaceConnection.findFirst({
    where: { storeId, platform: "trendyol", isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { userId: true }
  });
  if (!conn?.userId) throw new Error("Trendyol bağlantısı yok.");
  return conn.userId;
}

function buildClaimsPath(
  sellerId: string,
  params: {
    claimIds?: string;
    claimItemStatus?: string;
    startDate?: number;
    endDate?: number;
    orderNumber?: string;
    page?: number;
    size?: number;
  }
): string {
  const qs = new URLSearchParams();
  if (params.claimIds) qs.set("claimIds", params.claimIds);
  if (params.claimItemStatus) qs.set("claimItemStatus", params.claimItemStatus);
  if (params.startDate != null) qs.set("startDate", String(params.startDate));
  if (params.endDate != null) qs.set("endDate", String(params.endDate));
  if (params.orderNumber) qs.set("orderNumber", params.orderNumber);
  qs.set("page", String(params.page ?? 0));
  qs.set("size", String(params.size ?? 50));
  const q = qs.toString();
  return `/integration/order/sellers/${encodeURIComponent(sellerId)}/claims${q ? `?${q}` : ""}`;
}

export async function fetchTrendyolReturnClaims(params: {
  userId: string;
  storeId: string;
  claimIds?: string;
  claimItemStatus?: string;
  startDate?: number;
  endDate?: number;
  orderNumber?: string;
  maxPages?: number;
}): Promise<{ ok: true; items: unknown[] } | { ok: false; message: string }> {
  const sellerId = await getSellerIdForStore(params.storeId);
  const maxPages = params.maxPages ?? 80;
  const all: unknown[] = [];
  let page = 0;
  let totalPages = 1;

  while (page < totalPages && page < maxPages) {
    const path = buildClaimsPath(sellerId, {
      claimIds: params.claimIds,
      claimItemStatus: params.claimItemStatus,
      startDate: params.startDate,
      endDate: params.endDate,
      orderNumber: params.orderNumber,
      page,
      size: 50
    });
    const res = await trendyolFetch<TrendyolClaimsPage>(params.userId, params.storeId, path, {
      extraHeaders: { storeFrontCode: getTrendyolStorefrontCode() }
    });
    if (!res.ok) return { ok: false, message: res.message };
    const data = res.data;
    const chunk = Array.isArray(data.content) ? data.content : [];
    all.push(...chunk);
    const tp = data.totalPages;
    totalPages = typeof tp === "number" && tp >= 1 ? tp : page + 1 < chunk.length ? page + 2 : page + 1;
    if (chunk.length === 0) break;
    page += 1;
  }

  return { ok: true, items: all };
}

/** Müşteri iade nedenleri (dokümantasyon tablosu — API yoksa statik). */
export async function fetchTrendyolReturnReasons(): Promise<
  Array<{ code: string; name: string }>
> {
  return [
    { code: "301", name: "Kusurlu ürün gönderildi" },
    { code: "351", name: "Yanlış ürün gönderildi" },
    { code: "401", name: "Vazgeçtim" },
    { code: "651", name: "Göründüğü/gibi tanımlandığı gibi değil" },
    { code: "801", name: "Kargo geç geldi" },
    { code: "851", name: "Paket hasarlı" }
  ];
}

export async function fetchTrendyolClaimIssueReasons(params: {
  userId: string;
  storeId: string;
}): Promise<{ ok: true; reasons: Array<{ id: number; name: string }> } | { ok: false; message: string }> {
  const res = await trendyolFetch<Array<{ id: number; name: string }>>(
    params.userId,
    params.storeId,
    "/integration/order/claim-issue-reasons",
    { extraHeaders: { storeFrontCode: getTrendyolStorefrontCode() } }
  );
  if (!res.ok) return { ok: false, message: res.message };
  const arr = Array.isArray(res.data) ? res.data : [];
  return { ok: true, reasons: arr };
}

export async function syncTrendyolClaimIssueReasonsToStore(storeId: string): Promise<number> {
  const userId = await getActor(storeId);
  const r = await fetchTrendyolClaimIssueReasons({ userId, storeId });
  if (!r.ok) return 0;
  let n = 0;
  for (const reason of r.reasons) {
    const code = String(reason.id);
    await prisma.trendyolReturnReason.upsert({
      where: {
        storeId_platform_category_code: {
          storeId,
          platform: "trendyol",
          category: "claim_issue",
          code
        }
      },
      create: {
        storeId,
        platform: "trendyol",
        code,
        name: reason.name,
        category: "claim_issue",
        isActive: true,
        rawData: reason as unknown as Prisma.InputJsonValue,
        lastSyncedAt: new Date()
      },
      update: {
        name: reason.name,
        rawData: reason as unknown as Prisma.InputJsonValue,
        lastSyncedAt: new Date()
      }
    });
    n += 1;
  }
  return n;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function deriveClaimStatus(raw: Record<string, unknown>): string {
  const items = raw.items;
  if (!Array.isArray(items)) return "Unknown";
  const statuses: string[] = [];
  for (const it of items) {
    const rec = asRecord(it);
    const arr = Array.isArray(rec?.claimItems) ? rec!.claimItems : [];
    for (const ci of arr) {
      const c = asRecord(ci);
      const st = asRecord(c?.claimItemStatus);
      const name = str(st?.name);
      if (name) statuses.push(name);
    }
  }
  if (statuses.length === 0) return "Unknown";
  const priority = [
    "WaitingInAction",
    "Created",
    "InAnalysis",
    "Unresolved",
    "Rejected",
    "Cancelled",
    "Accepted"
  ];
  for (const p of priority) {
    if (statuses.some((s) => s.toLowerCase().includes(p.toLowerCase()))) return p;
  }
  return statuses[0] ?? "Unknown";
}

function deriveReasonText(raw: Record<string, unknown>): { id: string | null; text: string | null } {
  const items = raw.items;
  if (!Array.isArray(items)) return { id: null, text: null };
  for (const it of items) {
    const rec = asRecord(it);
    const arr = Array.isArray(rec?.claimItems) ? rec!.claimItems : [];
    for (const ci of arr) {
      const c = asRecord(ci);
      const cr = asRecord(c?.customerClaimItemReason);
      const tid = cr?.externalReasonId;
      const name = str(cr?.name);
      if (name || tid != null) {
        return {
          id: tid != null ? String(tid) : null,
          text: name
        };
      }
    }
  }
  return { id: null, text: null };
}

function sumTotalPrice(raw: Record<string, unknown>): number | null {
  const items = raw.items;
  if (!Array.isArray(items)) return null;
  let t = 0;
  let any = false;
  for (const it of items) {
    const rec = asRecord(it);
    const ol = asRecord(rec?.orderLine);
    const p = num(ol?.price);
    if (p != null) {
      t += p;
      any = true;
    }
  }
  return any ? t : null;
}

/** Trendyol onay API’si için claimLineItemId listesi (yanıt şemasına göre esnek). */
export function extractClaimLineItemIdsForApprove(raw: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const items = raw.items;
  if (!Array.isArray(items)) return [];
  for (const it of items) {
    const rec = asRecord(it);
    const arr = Array.isArray(rec?.claimItems) ? rec!.claimItems : [];
    for (const ci of arr) {
      const c = asRecord(ci);
      const lid =
        c?.claimLineItemId ??
        c?.claimLineItemID ??
        c?.lineItemId ??
        c?.lineItemID;
      if (lid != null) ids.add(String(lid));
      else if (c?.id != null) ids.add(String(c.id));
    }
  }
  return [...ids];
}

/** Red API’si için claimItemId listesi. */
export function extractClaimItemIdsForReject(raw: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const items = raw.items;
  if (!Array.isArray(items)) return [];
  for (const it of items) {
    const rec = asRecord(it);
    const arr = Array.isArray(rec?.claimItems) ? rec!.claimItems : [];
    for (const ci of arr) {
      const c = asRecord(ci);
      const cid = c?.claimItemId ?? c?.claimItemID ?? c?.id;
      if (cid != null) ids.add(String(cid));
    }
  }
  return [...ids];
}

export function extractRejectedPackageIdForTracking(
  rejectedPackageInfo: unknown,
  fallbackShipmentPackageId: string | null
): string | null {
  const r = asRecord(rejectedPackageInfo);
  if (r) {
    const id =
      r.packageId ?? r.id ?? r.shipmentPackageId ?? r.orderShipmentPackageId ?? r.shipmentPackageID;
    if (id != null) {
      const s = String(id).trim();
      if (s) return s;
    }
  }
  const f = fallbackShipmentPackageId?.trim();
  return f || null;
}

export async function refreshTrendyolReturnClaimInDb(params: {
  userId: string;
  storeId: string;
  trendyolClaimId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const pull = await fetchTrendyolReturnClaims({
    userId: params.userId,
    storeId: params.storeId,
    claimIds: params.trendyolClaimId,
    maxPages: 3
  });
  if (!pull.ok) return { ok: false, message: pull.message };
  const first = pull.items[0];
  const raw = asRecord(first);
  if (!raw) return { ok: false, message: "Trendyol yanıtında claim bulunamadı." };
  await upsertMarketplaceReturnClaimFromRaw({ storeId: params.storeId, raw });
  return { ok: true };
}

export async function upsertMarketplaceReturnClaimFromRaw(params: {
  storeId: string;
  raw: Record<string, unknown>;
}): Promise<{ id: string; claimId: string }> {
  const claimId = str(params.raw.claimId) ?? str(params.raw.id);
  if (!claimId) throw new Error("claimId yok");

  const claimDateMs = num(params.raw.claimDate) ?? Date.now();
  const claimDate = new Date(claimDateMs);
  const orderNumber = str(params.raw.orderNumber);
  const pkgId =
    params.raw.orderShipmentPackageId != null
      ? String(params.raw.orderShipmentPackageId)
      : null;

  const reason = deriveReasonText(params.raw);
  const claimStatus = deriveClaimStatus(params.raw);
  const cargoTn =
    params.raw.cargoTrackingNumber != null ? String(params.raw.cargoTrackingNumber) : null;

  const rejected = params.raw.rejectedpackageinfo ?? params.raw.rejectedPackageInfo;
  const replacement =
    params.raw.replacementOutboundpackageinfo ??
    params.raw.replacementOutboundPackageInfo;

  const row = await prisma.marketplaceReturnClaim.upsert({
    where: {
      storeId_platform_claimId: {
        storeId: params.storeId,
        platform: "trendyol",
        claimId
      }
    },
    create: {
      storeId: params.storeId,
      platform: "trendyol",
      claimId,
      orderNumber,
      shipmentPackageId: pkgId,
      claimDate,
      claimStatus,
      returnReasonId: reason.id,
      returnReasonText: reason.text,
      cargoTrackingNumber: cargoTn,
      cargoProviderName: str(params.raw.cargoProviderName),
      customerFirstName: str(params.raw.customerFirstName),
      customerLastName: str(params.raw.customerLastName),
      totalPrice: sumTotalPrice(params.raw),
      currency: "TRY",
      rejectedPackageInfo:
        rejected == null ? Prisma.JsonNull : (rejected as Prisma.InputJsonValue),
      replacementOutboundPackageInfo:
        replacement == null ? Prisma.JsonNull : (replacement as Prisma.InputJsonValue),
      rawData: params.raw as unknown as Prisma.InputJsonValue,
      lastFetchedAt: new Date()
    },
    update: {
      orderNumber,
      shipmentPackageId: pkgId,
      claimDate,
      claimStatus,
      returnReasonId: reason.id,
      returnReasonText: reason.text,
      cargoTrackingNumber: cargoTn,
      cargoProviderName: str(params.raw.cargoProviderName),
      customerFirstName: str(params.raw.customerFirstName),
      customerLastName: str(params.raw.customerLastName),
      totalPrice: sumTotalPrice(params.raw),
      rejectedPackageInfo:
        rejected == null ? Prisma.JsonNull : (rejected as Prisma.InputJsonValue),
      replacementOutboundPackageInfo:
        replacement == null ? Prisma.JsonNull : (replacement as Prisma.InputJsonValue),
      rawData: params.raw as unknown as Prisma.InputJsonValue,
      lastFetchedAt: new Date()
    }
  });

  await prisma.marketplaceReturnClaimLine.deleteMany({
    where: { claimIdRef: row.id, storeId: params.storeId }
  });

  const items = params.raw.items;
  if (Array.isArray(items)) {
    const lineRows: Prisma.MarketplaceReturnClaimLineCreateManyInput[] = [];
    for (const it of items) {
      const rec = asRecord(it);
      const ol = asRecord(rec?.orderLine);
      const arr = Array.isArray(rec?.claimItems) ? rec!.claimItems : [];
      for (const ci of arr) {
        const c = asRecord(ci);
        lineRows.push({
          storeId: params.storeId,
          claimIdRef: row.id,
          lineId: str(c?.id),
          barcode: str(ol?.barcode),
          stockCode: str(ol?.merchantSku),
          productName: str(ol?.productName),
          quantity: 1,
          lineUnitPrice: num(ol?.price),
          rawData: c as unknown as Prisma.InputJsonValue
        });
      }
    }
    if (lineRows.length > 0) {
      await prisma.marketplaceReturnClaimLine.createMany({ data: lineRows });
    }
  }

  return { id: row.id, claimId };
}

export async function approveReturnClaim(params: {
  userId: string;
  storeId: string;
  claimId: string;
  claimLineItemIds: string[];
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const sellerId = await getSellerIdForStore(params.storeId);
  if (params.claimLineItemIds.length === 0) {
    return { ok: false, message: "Onaylanacak kalem yok." };
  }
  const path = `/integration/order/sellers/${encodeURIComponent(sellerId)}/claims/${encodeURIComponent(params.claimId)}/items/approve`;
  const res = await trendyolPutJson(
    params.userId,
    params.storeId,
    path,
    {
      claimLineItemIdList: params.claimLineItemIds,
      params: {}
    },
    { extraHeaders: { storeFrontCode: getTrendyolStorefrontCode() } }
  );
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true };
}

export async function rejectReturnClaim(params: {
  userId: string;
  storeId: string;
  claimId: string;
  claimItemIds: string[];
  claimIssueReasonId: number;
  description?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const sellerId = await getSellerIdForStore(params.storeId);
  if (params.claimItemIds.length === 0) {
    return { ok: false, message: "Reddedilecek kalem yok." };
  }
  const path = `/integration/order/sellers/${encodeURIComponent(sellerId)}/claims/${encodeURIComponent(params.claimId)}/issue`;
  const desc = (params.description ?? "").trim().slice(0, 500);
  const res = await trendyolPostJson(params.userId, params.storeId, path, {
    claimIssueReasonId: params.claimIssueReasonId,
    claimItemIdList: params.claimItemIds,
    description: desc || "."
  });
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true };
}

export async function updateRejectedPackageTracking(params: {
  userId: string;
  storeId: string;
  packageId: number | string;
  cargoSenderNumber: string;
  providerCode: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const sellerId = await getSellerIdForStore(params.storeId);
  const pid = String(params.packageId);
  const path = `/integration/order/sellers/${encodeURIComponent(sellerId)}/shipment-packages/${encodeURIComponent(pid)}/tracking-details`;
  const res = await trendyolPutJson(
    params.userId,
    params.storeId,
    path,
    {
      cargoSenderNumber: params.cargoSenderNumber.trim(),
      providerCode: params.providerCode.trim()
    },
    { extraHeaders: { storeFrontCode: getTrendyolStorefrontCode() } }
  );
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true };
}

