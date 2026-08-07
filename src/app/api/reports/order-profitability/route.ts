import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore } from "@/lib/requireActiveStore";
import { getUserSettings } from "@/lib/userSettings";
import { resolveEffectivePricingInputs, type PricingTierLike } from "@/lib/pricingTiers";
import {
  computeOrderLineProfitability,
  summarizeOrderProfitability
} from "@/lib/orderProfitability";

const MS_DAY = 86_400_000;

export async function GET(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(365, Math.max(1, parseInt(searchParams.get("days") ?? "30", 10) || 30));
    const since = new Date(Date.now() - days * MS_DAY);

    const orders = await prisma.marketplaceOrder.findMany({
      where: {
        storeId: ctx.storeId,
        platform: "trendyol",
        isTestRecord: false,
        orderDate: { gte: since }
      },
      include: { lines: true },
      orderBy: { orderDate: "desc" },
      take: 500
    });

    const barcodes = Array.from(
      new Set(
        orders
          .flatMap((o) => o.lines.map((l) => l.barcode))
          .filter((b): b is string => !!b && b.trim() !== "")
      )
    );

    const mappings = barcodes.length
      ? await prisma.productMarketplaceMapping.findMany({
          where: { storeId: ctx.storeId, platform: "trendyol", barcode: { in: barcodes } },
          include: { product: true }
        })
      : [];

    const productByBarcode = new Map<
      string,
      { costPrice: number | null; commissionRate: number | null; cargoCost: number | null }
    >();
    for (const m of mappings) {
      if (!m.barcode) continue;
      const p = m.product as unknown as {
        costPrice: number | null;
        commissionRate: number | null;
        cargoCost: number | null;
      };
      productByBarcode.set(m.barcode, {
        costPrice: p.costPrice != null ? Number(p.costPrice) : null,
        commissionRate: p.commissionRate,
        cargoCost: p.cargoCost
      });
    }

    const anyPrisma = prisma as any;
    const tiers: PricingTierLike[] =
      anyPrisma.pricingTier && typeof anyPrisma.pricingTier.findMany === "function"
        ? await anyPrisma.pricingTier.findMany({ where: { storeId: ctx.storeId, isActive: true } })
        : [];
    const settings = await getUserSettings({ userId: ctx.userId, storeId: ctx.storeId });

    type ReportRow = {
      orderId: string;
      orderNumber: string;
      orderDate: string;
      productName: string | null;
      barcode: string | null;
      quantity: number;
      matched: boolean;
      revenue: number;
      commission: number;
      commissionSource: "marketplace_actual" | "estimated" | "unknown";
      cargoCost: number;
      productCost: number;
      hasCost: boolean;
      netProfit: number | null;
      profitMarginPct: number | null;
    };

    const rows: ReportRow[] = [];

    for (const order of orders) {
      for (const line of order.lines) {
        const matchedProduct = line.barcode ? productByBarcode.get(line.barcode) ?? null : null;

        const resolved = resolveEffectivePricingInputs({
          costPrice: matchedProduct?.costPrice ?? null,
          productOverrides: {
            commissionRate: matchedProduct?.commissionRate ?? null,
            cargoCost: matchedProduct?.cargoCost ?? null,
            targetProfitRate: null
          },
          storeDefaults: {
            commissionRate: settings.defaultCommissionRate,
            cargoCost: settings.defaultCargoCost,
            targetProfitRate: null
          },
          tiers
        });

        const calc = computeOrderLineProfitability({
          lineUnitPrice: line.lineUnitPrice,
          quantity: line.quantity,
          marketplaceCommissionAmount: line.commissionAmount,
          resolvedCommissionRate: resolved.commissionRate.value,
          resolvedCargoCost: resolved.cargoCost.value,
          productCostPrice: matchedProduct?.costPrice ?? null
        });

        rows.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderDate: order.orderDate.toISOString(),
          productName: line.productName,
          barcode: line.barcode,
          quantity: line.quantity,
          ...calc
        });
      }
    }

    const summary = summarizeOrderProfitability(rows);

    return NextResponse.json({ days, rows, summary });
  } catch (error) {
    console.error("Order profitability report error:", error);
    return NextResponse.json(
      { error: "Kârlılık raporu oluşturulurken hata oluştu." },
      { status: 500 }
    );
  }
}
