import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";

export async function GET(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    requirePermission(ctx, "trendyol.finance.view");
  } catch {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind")?.trim() || "";
  const kindFilter =
    kind === "settlements" || kind === "otherfinancials" ? kind : null;

  const page = Math.max(
    0,
    Math.trunc(Number(url.searchParams.get("page") || "0")) || 0
  );
  const pageSize = Math.min(
    100,
    Math.max(10, Math.trunc(Number(url.searchParams.get("pageSize") || "30")) || 30)
  );

  const fromMs = url.searchParams.get("fromMs");
  const toMs = url.searchParams.get("toMs");
  const fromBig =
    fromMs != null && fromMs !== "" && Number.isFinite(Number(fromMs))
      ? BigInt(Math.trunc(Number(fromMs)))
      : null;
  const toBig =
    toMs != null && toMs !== "" && Number.isFinite(Number(toMs))
      ? BigInt(Math.trunc(Number(toMs)))
      : null;

  const where: {
    storeId: string;
    kind?: string;
    transactionDateMs?: { gte?: bigint; lte?: bigint };
  } = { storeId: ctx.storeId };
  if (kindFilter) where.kind = kindFilter;
  if (fromBig != null || toBig != null) {
    where.transactionDateMs = {};
    if (fromBig != null) where.transactionDateMs.gte = fromBig;
    if (toBig != null) where.transactionDateMs.lte = toBig;
  }

  const [total, rows] = await Promise.all([
    prisma.trendyolFinanceLine.count({ where }),
    prisma.trendyolFinanceLine.findMany({
      where,
      orderBy: [{ transactionDateMs: "desc" }, { externalId: "desc" }],
      skip: page * pageSize,
      take: pageSize,
      select: {
        id: true,
        kind: true,
        externalId: true,
        transactionDateMs: true,
        transactionType: true,
        orderNumber: true,
        paymentOrderId: true,
        barcode: true,
        debt: true,
        credit: true,
        sellerRevenue: true,
        commissionAmount: true,
        description: true,
        updatedAt: true
      }
    })
  ]);

  const serialized = rows.map((r) => ({
    ...r,
    transactionDateMs:
      r.transactionDateMs != null ? r.transactionDateMs.toString() : null,
    debt: r.debt != null ? String(r.debt) : null,
    credit: r.credit != null ? String(r.credit) : null,
    sellerRevenue: r.sellerRevenue != null ? String(r.sellerRevenue) : null,
    commissionAmount:
      r.commissionAmount != null ? String(r.commissionAmount) : null,
    updatedAt: r.updatedAt.toISOString()
  }));

  return NextResponse.json({
    page,
    pageSize,
    total,
    lines: serialized
  });
}
