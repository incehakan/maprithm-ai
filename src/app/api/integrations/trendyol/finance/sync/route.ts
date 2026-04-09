import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  trendyolFetchChePage,
  parseCheLine,
  type TrendyolFinanceKind
} from "@/lib/trendyolFinanceChe";
import { resolveTrendyolCheSupplierId } from "@/lib/trendyolCheSupplier";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";

const MAX_RANGE_MS = 15 * 24 * 60 * 60 * 1000;

type Body = {
  kind?: string;
  startDateMs?: number;
  endDateMs?: number;
  transactionType?: string;
  transactionTypes?: string;
  transactionSubType?: string;
  paymentOrderId?: string;
  paymentDate?: string;
  page?: number;
  size?: 500 | 1000;
};

export async function POST(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    requirePermission(ctx, "trendyol.finance.sync");
  } catch {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 });
  }

  const kindRaw = typeof body.kind === "string" ? body.kind.trim() : "";
  const kind: TrendyolFinanceKind | null =
    kindRaw === "settlements" || kindRaw === "otherfinancials" ? kindRaw : null;
  if (!kind) {
    return NextResponse.json(
      { error: "kind: settlements veya otherfinancials olmalı." },
      { status: 400 }
    );
  }

  const start =
    typeof body.startDateMs === "number" && Number.isFinite(body.startDateMs)
      ? Math.trunc(body.startDateMs)
      : null;
  const end =
    typeof body.endDateMs === "number" && Number.isFinite(body.endDateMs)
      ? Math.trunc(body.endDateMs)
      : null;
  if (start == null || end == null || end < start) {
    return NextResponse.json(
      { error: "startDateMs ve endDateMs geçerli milisaniye olmalı." },
      { status: 400 }
    );
  }
  if (end - start > MAX_RANGE_MS) {
    return NextResponse.json(
      { error: "Trendyol CHE: tarih aralığı en fazla 15 gün olabilir." },
      { status: 400 }
    );
  }

  const txType = typeof body.transactionType === "string" ? body.transactionType.trim() : "";
  const txTypes =
    typeof body.transactionTypes === "string" ? body.transactionTypes.trim() : "";
  if (!txType && !txTypes) {
    return NextResponse.json(
      { error: "transactionType veya transactionTypes zorunlu." },
      { status: 400 }
    );
  }

  const conn = await prisma.marketplaceConnection.findUnique({
    where: { storeId_platform: { storeId: ctx.storeId, platform: "trendyol" } }
  });
  if (!conn?.isActive) {
    return NextResponse.json(
      { error: "Aktif Trendyol bağlantısı yok." },
      { status: 400 }
    );
  }

  const sellerId = String(conn.sellerId).trim();
  const supplierId = resolveTrendyolCheSupplierId(conn);
  if (!sellerId || !supplierId) {
    return NextResponse.json(
      { error: "Satıcı / supplier bilgisi eksik. Gerekirse Ayarlar'da CHE Supplier ID girin." },
      { status: 400 }
    );
  }

  const page = body.page != null ? Math.max(0, Math.trunc(body.page)) : 0;
  const size: 500 | 1000 = body.size === 1000 ? 1000 : 500;

  const syncRun = await prisma.trendyolFinanceSyncRun.create({
    data: {
      storeId: ctx.storeId,
      userId: ctx.userId,
      kind,
      supplierId,
      startDateMs: BigInt(start),
      endDateMs: BigInt(end),
      transactionType: txType || null,
      transactionTypes: txTypes || null,
      transactionSubType:
        typeof body.transactionSubType === "string"
          ? body.transactionSubType.trim() || null
          : null,
      paymentOrderId:
        typeof body.paymentOrderId === "string"
          ? body.paymentOrderId.trim() || null
          : null,
      paymentDate:
        typeof body.paymentDate === "string" ? body.paymentDate.trim() || null : null,
      pageFetched: page,
      pageSize: size,
      success: false
    }
  });

  const api = await trendyolFetchChePage({
    userId: ctx.userId,
    storeId: ctx.storeId,
    sellerId,
    kind,
    supplierId,
    startDateMs: start,
    endDateMs: end,
    transactionType: txType || undefined,
    transactionTypes: txTypes || undefined,
    transactionSubType: body.transactionSubType,
    paymentOrderId: body.paymentOrderId,
    paymentDate: body.paymentDate,
    page,
    size
  });

  if (!api.ok) {
    await prisma.trendyolFinanceSyncRun.updateMany({
      where: { id: syncRun.id, storeId: ctx.storeId },
      data: {
        httpStatus: api.status,
        errorMessage: api.message.slice(0, 4000),
        success: false
      }
    });
    return NextResponse.json(
      { error: api.message, syncRunId: syncRun.id },
      { status: api.status >= 400 ? api.status : 502 }
    );
  }

  const payload = api.data ?? {};
  const content = Array.isArray(payload.content) ? payload.content : [];
  const totalPages =
    typeof payload.totalPages === "number" ? payload.totalPages : null;
  const totalElements =
    typeof payload.totalElements === "number" ? payload.totalElements : null;

  let linesUpserted = 0;
  for (const raw of content) {
    if (!raw || typeof raw !== "object") continue;
    const parsed = parseCheLine(raw as Record<string, unknown>, kind);
    if (!parsed) continue;

    await prisma.trendyolFinanceLine.upsert({
      where: {
        storeId_kind_externalId: {
          storeId: ctx.storeId,
          kind,
          externalId: parsed.externalId
        }
      },
      create: {
        storeId: ctx.storeId,
        syncRunId: syncRun.id,
        kind,
        externalId: parsed.externalId,
        transactionDateMs: parsed.transactionDateMs ?? undefined,
        transactionType: parsed.transactionType,
        orderNumber: parsed.orderNumber,
        paymentOrderId: parsed.paymentOrderId,
        barcode: parsed.barcode,
        debt: parsed.debt ?? undefined,
        credit: parsed.credit ?? undefined,
        sellerRevenue: parsed.sellerRevenue ?? undefined,
        commissionAmount: parsed.commissionAmount ?? undefined,
        description: parsed.description,
        raw: parsed.raw as object
      },
      update: {
        syncRunId: syncRun.id,
        transactionDateMs: parsed.transactionDateMs ?? undefined,
        transactionType: parsed.transactionType,
        orderNumber: parsed.orderNumber,
        paymentOrderId: parsed.paymentOrderId,
        barcode: parsed.barcode,
        debt: parsed.debt ?? undefined,
        credit: parsed.credit ?? undefined,
        sellerRevenue: parsed.sellerRevenue ?? undefined,
        commissionAmount: parsed.commissionAmount ?? undefined,
        description: parsed.description,
        raw: parsed.raw as object
      }
    });
    linesUpserted += 1;
  }

  await prisma.trendyolFinanceSyncRun.updateMany({
    where: { id: syncRun.id, storeId: ctx.storeId },
    data: {
      httpStatus: api.status,
      success: true,
      totalPages,
      totalElements,
      responseSnapshot: payload as object,
      errorMessage: null
    }
  });

  return NextResponse.json({
    success: true,
    syncRunId: syncRun.id,
    linesUpserted,
    totalPages,
    totalElements,
    page,
    size,
    message: `${linesUpserted} satır kaydedildi (sayfa ${page}).`
  });
}
