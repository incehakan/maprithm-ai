import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createActivityLog } from "@/lib/activityLog";

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
  const session = await auth();
  if (!session?.user || !(session.user as any).id) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const userId = (session.user as any).id as string;

  try {
    const body = await request.json().catch(() => null);
    const productId = body?.productId;
    const apply = body?.apply === true;

    if (!productId || typeof productId !== "string") {
      return NextResponse.json(
        { error: "Ürün ID'si gerekli." },
        { status: 400 }
      );
    }

    const product = await prisma.product.findFirst({
      where: { id: productId, userId }
    });

    if (!product) {
      return NextResponse.json(
        { error: "Ürün bulunamadı." },
        { status: 404 }
      );
    }

    let optimized: OptimizeResult;
    let isMock = false;
    try {
      optimized = await optimizeWithAI(
        product.name,
        product.description ?? null
      );
    } catch (err) {
      console.error("Optimize AI error for product", productId, err);
      console.warn("OpenAI hatası, mock veriye geçiliyor...");
      optimized = getMockOptimize(product.name, product.description ?? "");
      isMock = true;
    }

    if (apply) {
      const tagsStr =
        Array.isArray(optimized.tags) && optimized.tags.length > 0
          ? optimized.tags.join(", ")
          : product.tags;

      await prisma.product.update({
        where: { id: productId },
        data: {
          name: optimized.title,
          description: optimized.description,
          seoDescription: optimized.seoDescription,
          tags: tagsStr
        }
      });

      await createActivityLog({
        userId,
        action: "ai_optimize_single",
        entityType: "product",
        entityId: productId,
        message: `AI optimizasyonu uygulandı: ${optimized.title}`
      });

      return NextResponse.json({
        applied: true,
        optimized: {
          title: optimized.title,
          description: optimized.description,
          seoDescription: optimized.seoDescription,
          tags: optimized.tags
        }
      });
    }

    return NextResponse.json({
      applied: false,
      isMock,
      optimized: {
        title: optimized.title,
        description: optimized.description,
        seoDescription: optimized.seoDescription,
        tags: optimized.tags
      }
    });
  } catch (error) {
    console.error("Optimize product error:", error);
    return NextResponse.json(
      { error: "Optimizasyon işlenirken hata oluştu." },
      { status: 500 }
    );
  }
}
