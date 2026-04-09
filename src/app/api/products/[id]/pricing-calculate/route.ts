import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { requireActiveStore } from "@/lib/requireActiveStore";
import { secureProductUpdateMany } from "@/lib/security/storeScope";
import {
  calculatePricing,
  validatePricingInput,
  type PricingInput
} from "@/lib/pricingCalculator";

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: unknown) {
    const msg =
      e instanceof Error && e.message === "NO_ACTIVE_STORE"
        ? "Aktif mağaza yok."
        : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
  const { userId, storeId } = ctx;

  try {
    const product = await prisma.product.findFirst({
      where: { id: params.id, userId, storeId },
      select: { id: true, name: true }
    });

    if (!product) {
      return NextResponse.json(
        { error: "Ürün bulunamadı." },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { error: "Geçersiz istek." },
        { status: 400 }
      );
    }

    const {
      costPrice,
      commissionRate,
      cargoCost,
      vatRate,
      targetProfitRate,
      save
    } = body;

    const input: Partial<PricingInput> = {
      costPrice: typeof costPrice === "number" ? costPrice : parseFloat(costPrice),
      commissionRate: typeof commissionRate === "number" ? commissionRate : parseFloat(commissionRate),
      cargoCost: typeof cargoCost === "number" ? cargoCost : parseFloat(cargoCost),
      vatRate: typeof vatRate === "number" ? vatRate : parseFloat(vatRate),
      targetProfitRate: typeof targetProfitRate === "number" ? targetProfitRate : parseFloat(targetProfitRate)
    };

    const validationError = validatePricingInput(input);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const result = calculatePricing(input as PricingInput);

    if (save === true) {
      try {
        // Maliyet (costPrice) yalnızca XML feed senkronu ile set edilir; satış/komisyon kaydı bunu ezmez.
        const u = await secureProductUpdateMany(params.id, storeId, {
          commissionRate: input.commissionRate,
          cargoCost: input.cargoCost,
          vatRate: input.vatRate,
          targetProfitRate: input.targetProfitRate
        });
        if (u.count === 0) {
          return NextResponse.json(
            { error: "Ürün bulunamadı." },
            { status: 404 }
          );
        }

        await createActivityLog({
          userId,
          storeId,
          membershipId: ctx.membershipId,
          action: "pricing_calculated",
          entityType: "product",
          entityId: params.id,
          message: `Fiyat önerisi hesaplandı ve kaydedildi: ${product.name} (Önerilen: ₺${result.suggestedPrice})`
        });
      } catch (saveError) {
        console.error("Pricing save error:", saveError);
        return NextResponse.json({
          saved: false,
          saveError: "Fiyat bilgileri kaydedilemedi. Veritabanı migration gerekiyor olabilir. Terminalde: npx prisma migrate dev --name add_pricing_fields",
          ...result
        });
      }
    } else {
      await createActivityLog({
        userId,
        storeId,
        membershipId: ctx.membershipId,
        action: "pricing_calculated",
        entityType: "product",
        entityId: params.id,
        message: `Fiyat önerisi hesaplandı: ${product.name} (Önerilen: ₺${result.suggestedPrice})`
      });
    }

    return NextResponse.json({
      saved: save === true,
      ...result
    });
  } catch (error) {
    console.error("Pricing calculate error:", error);
    return NextResponse.json(
      { error: "Fiyat hesaplama sırasında hata oluştu." },
      { status: 500 }
    );
  }
}
