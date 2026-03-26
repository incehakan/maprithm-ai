import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runApplyMappingForSuggestionList } from "@/lib/applyApprovedTrendyolImportSuggestions";
import { createActivityLog } from "@/lib/activityLog";
import { isImportUsable } from "@/lib/importStatus";
import { requireActiveStore } from "@/lib/requireActiveStore";

type Params = { params: { id: string } };

type BulkAction = "approve" | "reject" | "apply_mapping";

type BulkBody = {
  action: BulkAction;
  suggestionIds: string[];
};

function getUserIdFromSession(session: {
  user?: { id?: string } | null;
} | null): string | null {
  if (!session?.user?.id) return null;
  return session.user.id;
}

/**
 * POST /api/imports/[id]/trendyol-suggestions/bulk
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
      { error: "Pasif import verisiyle toplu suggestion işlemi yapılamaz." },
      { status: 400 }
    );
  }

  let body: BulkBody;
  try {
    body = (await request.json()) as BulkBody;
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 });
  }

  const action = body.action;
  const ids = Array.isArray(body.suggestionIds)
    ? body.suggestionIds.filter((x) => typeof x === "string" && x.length > 0)
    : [];

  if (!action || !["approve", "reject", "apply_mapping"].includes(action)) {
    return NextResponse.json({ error: "Geçersiz action." }, { status: 400 });
  }

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "En az bir suggestionId gerekli." },
      { status: 400 }
    );
  }

  const suggestions = await prisma.importRowMarketplaceSuggestion.findMany({
    where: {
      id: { in: ids },
      platform: "trendyol",
      importRow: { importJobId: params.id }
    },
    include: {
      importRow: true,
      suggestedAttributes: true
    }
  });

  if (suggestions.length === 0) {
    return NextResponse.json(
      { error: "Geçerli öneri bulunamadı." },
      { status: 404 }
    );
  }

  const results: Array<{
    suggestionId: string;
    ok: boolean;
    message?: string;
  }> = [];

  if (action === "approve") {
    await prisma.importRowMarketplaceSuggestion.updateMany({
      where: { id: { in: suggestions.map((s) => s.id) } },
      data: { status: "approved" }
    });
    for (const s of suggestions) {
      results.push({ suggestionId: s.id, ok: true });
    }
  } else if (action === "reject") {
    await prisma.importRowMarketplaceSuggestion.updateMany({
      where: { id: { in: suggestions.map((s) => s.id) } },
      data: { status: "rejected" }
    });
    for (const s of suggestions) {
      results.push({ suggestionId: s.id, ok: true });
    }
  } else {
    let mappingBatch;
    try {
      mappingBatch = await runApplyMappingForSuggestionList(
        prisma,
        ctx.userId,
        ctx.storeId,
        params.id,
        suggestions
      );
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Mapping işlemi başarısız." },
        { status: 400 }
      );
    }

    if (mappingBatch.successCount > 0) {
      await createActivityLog({
        userId: ctx.userId,
        storeId: ctx.storeId,
        membershipId: ctx.membershipId,
        action: "TRENDYOL_AI_MATCHING_APPLIED",
        entityType: "import_job",
        entityId: params.id,
        message: "AI Trendyol eşleştirmeleri ürün kayıtlarına uygulandı"
      });
    }

    return NextResponse.json({
      success: mappingBatch.failedCount === 0,
      action,
      total: mappingBatch.total,
      successCount: mappingBatch.successCount,
      failedCount: mappingBatch.failedCount,
      successes: mappingBatch.successes,
      failures: mappingBatch.failures,
      processed: mappingBatch.total
    });
  }

  return NextResponse.json({
    success: true,
    action,
    processed: results.length,
    results
  });
}
