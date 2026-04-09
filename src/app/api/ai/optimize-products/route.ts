import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { requireActiveStore } from "@/lib/requireActiveStore";
import { secureProductUpdateMany } from "@/lib/security/storeScope";
import { createErrorResponse, jsonError } from "@/lib/errors/errorResponse";

type OptimizeResult = {
  title: string;
  description: string;
  seoDescription: string;
  tags: string[];
};

function getMockOptimize(name: string, description: string): OptimizeResult {
  const slug = name.slice(0, 40).trim() || "Ürün";
  return {
    title: `[MOCK] ${slug} - Optimize`,
    description:
      description?.trim() ||
      `Mock optimize edilmiş açıklama. Orijinal: ${name}`,
    seoDescription: `[MOCK] ${slug} - SEO açıklaması.`,
    tags: ["mock", "optimize", ...name.split(/\s+/).filter(Boolean).slice(0, 3)]
  };
}

async function optimizeWithAI(
  name: string,
  description: string | null
): Promise<OptimizeResult> {
  const input = [name, description].filter(Boolean).join("\n");
  if (!process.env.OPENAI_API_KEY) {
    return getMockOptimize(name, description ?? "");
  }

  const prompt = `Mevcut ürün bilgisini Türkiye e-ticaret pazaryerlerine (Trendyol, Hepsiburada, N11) göre optimize et.

Ürün adı:
${name}

Mevcut açıklama:
${description || "(yok)"}

Aşağıdaki formatta sadece JSON döndür:
{
  "title": "SEO uyumlu, optimize edilmiş ürün başlığı (maks 110 karakter)",
  "description": "Satış odaklı, geliştirilmiş ürün açıklaması (Türkçe)",
  "seoDescription": "Arama sonuçları için kısa SEO açıklaması (maks 160 karakter)",
  "tags": ["etiket1", "etiket2", "etiket3"]
}

Sadece geçerli JSON üret, başka metin ekleme.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "Sen Türkiye e-ticaret pazaryerlerine ürün metinlerini optimize eden bir asistanısın."
      },
      { role: "user", content: prompt }
    ],
    temperature: 0.6
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Modelden çıktı alınamadı.");

  const parsed = JSON.parse(content);
  return {
    title: parsed.title ?? name,
    description: parsed.description ?? description ?? "",
    seoDescription: parsed.seoDescription ?? "",
    tags: Array.isArray(parsed.tags) ? parsed.tags : []
  };
}

export async function POST(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: unknown) {
    const noStore = e instanceof Error && e.message === "NO_ACTIVE_STORE";
    return noStore
      ? jsonError("NO_ACTIVE_STORE", { httpStatus: 401 })
      : jsonError("UNAUTHORIZED", { httpStatus: 401 });
  }
  const { userId, storeId } = ctx;

  try {
    const body = await request.json().catch(() => null);
    const productIds = body?.productIds;
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return jsonError("VALIDATION_ERROR", {
        userMessage: "En az bir ürün seçin.",
        field: "productIds",
        httpStatus: 400
      });
    }

    const ids = productIds.filter((id: unknown) => typeof id === "string");
    const results: { productId: string; success: boolean; error?: string }[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const productId of ids) {
      const product = await prisma.product.findFirst({
        where: { id: productId, userId, storeId }
      });

      if (!product) {
        results.push({ productId, success: false, error: "Ürün bulunamadı." });
        errorCount++;
        continue;
      }

      let optimized: OptimizeResult;
      try {
        optimized = await optimizeWithAI(
          product.name,
          product.description ?? null
        );
      } catch (err) {
        console.error("Optimize AI error for product", productId, err);
        console.warn("OpenAI hatası, mock veriye geçiliyor...");
        optimized = getMockOptimize(product.name, product.description ?? "");
      }

      const tagsStr =
        Array.isArray(optimized.tags) && optimized.tags.length > 0
          ? optimized.tags.join(", ")
          : product.tags;

      try {
        const u = await secureProductUpdateMany(productId, storeId, {
          name: optimized.title,
          description: optimized.description,
          seoDescription: optimized.seoDescription,
          tags: tagsStr
        });
        if (u.count === 0) {
          results.push({ productId, success: false, error: "Ürün bulunamadı." });
          errorCount++;
          continue;
        }
        results.push({ productId, success: true });
        successCount++;
      } catch (err) {
        console.error("Update error for product", productId, err);
        results.push({
          productId,
          success: false,
          error: "Veritabanı güncellenemedi."
        });
        errorCount++;
      }
    }

    await createActivityLog({
      userId,
      storeId,
      membershipId: ctx.membershipId,
      action: "bulk_ai_optimize",
      entityType: "product",
      entityId: null,
      message: `Toplu AI optimizasyonu: ${successCount} ürün başarıyla, ${errorCount} ürün hatalı (toplam ${ids.length}).`
    });

    return NextResponse.json({
      successCount,
      errorCount,
      total: ids.length,
      results
    });
  } catch (error) {
    console.error("Optimize products error:", error);
    return createErrorResponse(error, {
      route: "POST /api/ai/optimize-products"
    });
  }
}
