import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createActivityLog } from "@/lib/activityLog";
import {
  calculatePricing,
  validatePricingInput,
  type PricingInput
} from "@/lib/pricingCalculator";

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || !(session.user as any).id) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const userId = (session.user as any).id as string;

  try {
    const product = await prisma.product.findFirst({
      where: { id: params.id, userId },
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
        await prisma.product.update({
          where: { id: params.id },
          data: {
            costPrice: input.costPrice,
            commissionRate: input.commissionRate,
            cargoCost: input.cargoCost,
            vatRate: input.vatRate,
            targetProfitRate: input.targetProfitRate
          }
        });

        await createActivityLog({
          userId,
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
