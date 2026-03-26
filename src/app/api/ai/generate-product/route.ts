import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";

/** Key yoksa test için mock yanıt döner. */
function getMockResponse(input: string) {
  const slug = input.slice(0, 50).trim() || "Ürün";
  return {
    title: `[MOCK] ${slug} - Türkiye E-ticaret`,
    description: `Bu ürün test amaçlı mock veridir. Girdi: "${input}". Gerçek key eklendiğinde AI tarafından üretilecektir.`,
    seoDescription: `[MOCK] ${slug} - Satış sayfası için kısa açıklama.`,
    tags: ["mock", "test", ...input.split(/\s+/).filter(Boolean).slice(0, 3)]
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const input = body?.input?.toString().trim();

  if (!input) {
    return NextResponse.json(
      { error: "Lütfen ürün fikrini girin." },
      { status: 400 }
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(getMockResponse(input), { status: 200 });
  }

  try {
    const prompt = `Kullanıcıdan gelen ürün bilgisini al ve Türkiye e-ticaret pazaryerlerine (Trendyol, Hepsiburada, N11 vb.) uygun içerik üret.

Girdi (ürün fikri):
"${input}"

Aşağıdaki formatta JSON döndür:
{
  "title": "SEO uyumlu, tıklama getirecek ürün başlığı (maks 110 karakter)",
  "description": "Satış odaklı, detaylı ama okunabilir ürün açıklaması (Türkçe)",
  "seoDescription": "Arama sonuçları için kısa SEO açıklaması (maks 160 karakter)",
  "tags": ["virgülle ayrılmış", "kısa", "Türkçe", "etiketler"]
}

Sadece geçerli JSON üret, açıklama ekleme.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "Sen Türkiye e-ticaret pazaryerlerine ürün başlığı ve açıklaması yazan bir metin yazarsın."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.8
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "Modelden geçerli çıktı alınamadı." },
        { status: 500 }
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json(
        { error: "Model yanıtı beklenen JSON formatında değil." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        title: parsed.title,
        description: parsed.description,
        seoDescription: parsed.seoDescription,
        tags: parsed.tags
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("AI generate-product error:", error);
    return NextResponse.json(getMockResponse(input), { status: 200 });
  }
}

