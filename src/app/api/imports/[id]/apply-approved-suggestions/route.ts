import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { applyApprovedTrendyolImportSuggestions } from "@/lib/applyApprovedTrendyolImportSuggestions";
import { isImportUsable } from "@/lib/importStatus";
import { requireActiveStore } from "@/lib/requireActiveStore";

type Params = { params: { id: string } };

type PostBody = {
  /** Boş veya yok: işteki tüm approved öneriler */
  suggestionIds?: string[];
};

function getUserIdFromSession(session: {
  user?: { id?: string } | null;
} | null): string | null {
  if (!session?.user?.id) return null;
  return session.user.id;
}

/**
 * POST /api/imports/[id]/apply-approved-suggestions
 *
 * Onaylı (approved) Trendyol önerilerini Product + ProductMarketplaceMapping'e uygular.
 * Başarılı uygulamalarda suggestion.status = applied ve activity log yazılır.
 */
export async function POST(request: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  const job = await prisma.importJob.findFirst({
    where: { id: params.id, userId: ctx.userId, storeId: ctx.storeId }
  });

  if (!job) {
    return NextResponse.json({ error: "İçe aktarma bulunamadı." }, { status: 404 });
  }
  if (!isImportUsable(job)) {
    return NextResponse.json(
      { error: "Pasif import verisiyle mapping uygulanamaz." },
      { status: 400 }
    );
  }

  let body: PostBody = {};
  try {
    const text = await request.text();
    if (text?.trim()) body = JSON.parse(text) as PostBody;
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 });
  }

  let batch;
  try {
    batch = await applyApprovedTrendyolImportSuggestions({
      prisma,
      userId: ctx.userId,
      storeId: ctx.storeId,
      importJobId: params.id,
      suggestionIds: body.suggestionIds,
      logAction: true
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "İşlem başarısız." },
      { status: 400 }
    );
  }

  const { total, successCount, failedCount } = batch;
  const allOk = total === 0 || failedCount === 0;

  return NextResponse.json({
    success: allOk,
    importJobId: params.id,
    total,
    successCount,
    failedCount,
    successes: batch.successes,
    failures: batch.failures
  });
}
