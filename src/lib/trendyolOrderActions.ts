import { prisma } from "@/lib/prisma";
import { trendyolPutJson } from "@/lib/trendyolFetch";
import type { Prisma } from "@prisma/client";

export type TrendyolPackageActionStatus =
  | "Picking"
  | "Invoiced"
  | "Shipped"
  | "Cancel"
  | "Unsupplied";

function getTrendyolStorefrontCode(): string {
  return process.env.TRENDYOL_STOREFRONT_CODE?.trim() || "TR";
}

function mapToTrendyolStatus(status: TrendyolPackageActionStatus): string {
  switch (status) {
    case "Cancel":
      return "Cancelled";
    case "Unsupplied":
      return "UnSupplied";
    default:
      return status;
  }
}

function pickReasonId(payload: unknown): number {
  const p = payload as Record<string, unknown>;
  const v = p?.reasonId;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return 500;
}

function normalizeLinesForCancel(
  lines: Array<{ lineId?: string | null; quantity?: number | null }>
): Array<{ lineId: number; quantity: number }> {
  const out: Array<{ lineId: number; quantity: number }> = [];
  for (const l of lines) {
    const q =
      typeof l.quantity === "number" && Number.isFinite(l.quantity)
        ? l.quantity
        : 0;
    let lineIdNum = 0;
    if (l.lineId != null) {
      const parsed = Number(l.lineId);
      if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
        lineIdNum = Math.trunc(parsed);
      }
    }
    out.push({ lineId: lineIdNum, quantity: q });
  }
  // Trendyol expects at least one line in many cases
  if (out.length === 0) out.push({ lineId: 0, quantity: 0 });
  return out;
}

export type TrendyolPackageActionPayload = {
  trackingNumber?: string;
  cargoProviderName?: string;
  reasonId?: number;
  // optional override for cancel/unsupplied
  lines?: Array<{ lineId?: string | null; quantity?: number | null }>;
  // optional invoice number for Invoiced
  invoiceNumber?: string;
};

export async function updatePackageStatus(
  userId: string,
  storeId: string,
  shipmentPackageId: string,
  status: TrendyolPackageActionStatus,
  payload: TrendyolPackageActionPayload = {}
): Promise<{ trendyolData: unknown; sentStatus: string }> {
  // sellerId is required for all Trendyol order integration endpoints
  const conn = await prisma.marketplaceConnection.findFirst({
    where: { storeId, platform: "trendyol", isActive: true },
    select: { sellerId: true }
  });

  if (!conn?.sellerId) {
    throw new Error("Trendyol bağlantısı bulunamadı (sellerId eksik).");
  }

  const sellerId = String(conn.sellerId).trim();
  const storeFrontCode = getTrendyolStorefrontCode();

  // Picking / Invoiced
  if (status === "Picking" || status === "Invoiced") {
    const body: Record<string, unknown> = { status };
    if (status === "Invoiced" && payload.invoiceNumber) {
      body.params = { invoiceNumber: payload.invoiceNumber };
    }

    const path = `/integration/order/sellers/${encodeURIComponent(
      sellerId
    )}/shipment-packages/${encodeURIComponent(
      shipmentPackageId
    )}`;

    const res = await trendyolPutJson<unknown>(userId, storeId, path, body, {
      extraHeaders: { storeFrontCode }
    });
    if (!res.ok) throw new Error(res.message);
    return { trendyolData: res.data, sentStatus: status };
  }

  // Shipped => tracking-details endpoint
  if (status === "Shipped") {
    const trackingNumber = payload.trackingNumber?.trim();
    const cargoProviderName = payload.cargoProviderName?.trim();
    if (!trackingNumber) {
      throw new Error("Şunlar gerekli: trackingNumber.");
    }
    if (!cargoProviderName) {
      throw new Error("Şunlar gerekli: cargoProviderName.");
    }

    const path = `/integration/order/sellers/${encodeURIComponent(
      sellerId
    )}/shipment-packages/${encodeURIComponent(
      shipmentPackageId
    )}/tracking-details`;

    const body = {
      cargoSenderNumber: trackingNumber,
      providerCode: cargoProviderName
    };

    const res = await trendyolPutJson<unknown>(userId, storeId, path, body, {
      extraHeaders: { storeFrontCode }
    });
    if (!res.ok) throw new Error(res.message);
    return { trendyolData: res.data, sentStatus: "Shipped" };
  }

  // Cancel / Unsupplied => items/unsupplied endpoint
  if (status === "Cancel" || status === "Unsupplied") {
    const shouldKeepPreviousStatus = status === "Unsupplied";
    const reasonId = pickReasonId(payload);

    const order = await prisma.marketplaceOrder.findUnique({
      where: {
        storeId_platform_shipmentPackageId: {
          storeId,
          platform: "trendyol",
          shipmentPackageId
        }
      },
      include: { lines: true }
    });

    if (!order) {
      throw new Error("Paket DB'de bulunamadı.");
    }

    const linesFromDb = order.lines.map((l) => ({
      lineId: l.lineId,
      quantity: 0
    }));

    const finalLines =
      payload.lines && Array.isArray(payload.lines)
        ? payload.lines
        : linesFromDb;

    const normalized = normalizeLinesForCancel(finalLines);

    const path = `/integration/order/sellers/${encodeURIComponent(
      sellerId
    )}/shipment-packages/${encodeURIComponent(
      shipmentPackageId
    )}/items/unsupplied`;

    const body = {
      lines: normalized,
      reasonId,
      shouldKeepPreviousStatus
    };

    const res = await trendyolPutJson<unknown>(userId, storeId, path, body, {
      extraHeaders: { storeFrontCode }
    });
    if (!res.ok) throw new Error(res.message);
    return {
      trendyolData: res.data,
      sentStatus: mapToTrendyolStatus(status)
    };
  }

  // Exhaustiveness
  throw new Error("Desteklenmeyen durum.");
}

