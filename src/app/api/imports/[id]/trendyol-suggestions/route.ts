import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  confidenceBand,
  countMissingRequiredAttributes
} from "@/lib/importTrendyolSuggestionUtils";
import { isImportUsable } from "@/lib/importStatus";

type Params = { params: { id: string } };

function getUserIdFromSession(session: {
  user?: { id?: string } | null;
} | null): string | null {
  if (!session?.user?.id) return null;
  return session.user.id;
}

/**
 * GET /api/imports/[id]/trendyol-suggestions
 * Toplu Trendyol öneri ekranı için satırlar (filtreler query ile).
 *
 * Query (AND):
 * - confidence=high|medium|low
 * - missing=1 (eksik zorunlu özellik)
 * - status=suggested|approved|rejected|applied
 */
export async function GET(request: Request, { params }: Params) {
  const session = await auth();
  const userId = getUserIdFromSession(session);
  if (!userId) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const job = await prisma.importJob.findFirst({
    where: { id: params.id, userId }
  });

  if (!job) {
    return NextResponse.json({ error: "İçe aktarma bulunamadı." }, { status: 404 });
  }
  if (!isImportUsable(job)) {
    return NextResponse.json(
      { error: "Pasif import verisi Trendyol AI önerilerinde gösterilemez." },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const confidenceFilter = searchParams.get("confidence")?.toLowerCase() as
    | "high"
    | "medium"
    | "low"
    | undefined;
  const missingOnly = searchParams.get("missing") === "1";
  const statusFilter = searchParams.get("status")?.toLowerCase();

  const suggestions = await prisma.importRowMarketplaceSuggestion.findMany({
    where: {
      platform: "trendyol",
      importRow: { importJobId: params.id }
    },
    include: {
      importRow: {
        select: {
          id: true,
          rowIndex: true,
          normalizedName: true,
          normalizedSku: true,
          status: true
        }
      },
      suggestedAttributes: {
        select: {
          id: true,
          attributeId: true,
          attributeName: true,
          attributeValueId: true,
          attributeValue: true,
          customValue: true,
          isRequired: true
        },
        orderBy: [{ isRequired: "desc" }, { attributeName: "asc" }]
      }
    },
    orderBy: {
      importRow: { rowIndex: "asc" }
    },
    take: 1000
  });

  let rows = suggestions.map((s) => {
    const missingRequiredCount = countMissingRequiredAttributes(
      s.missingRequiredAttributes
    );
    const conf = s.confidenceScore;
    return {
      suggestionId: s.id,
      importRowId: s.importRowId,
      rowIndex: s.importRow.rowIndex,
      importRowStatus: s.importRow.status,
      productName:
        s.importRow.normalizedName?.trim() ||
        `(Satır ${s.importRow.rowIndex})`,
      normalizedSku: s.importRow.normalizedSku,
      suggestedBrandId: s.suggestedBrandId,
      suggestedBrandName: s.suggestedBrandName,
      suggestedCategoryId: s.suggestedCategoryId,
      suggestedCategoryName: s.suggestedCategoryName,
      confidenceScore: conf,
      confidenceBand: confidenceBand(conf),
      missingRequiredCount,
      status: s.status,
      aiReasoningSummary: s.aiReasoningSummary,
      suggestedAttributes: s.suggestedAttributes
    };
  });

  if (confidenceFilter === "high" || confidenceFilter === "medium" || confidenceFilter === "low") {
    rows = rows.filter((r) => r.confidenceBand === confidenceFilter);
  }

  if (missingOnly) {
    rows = rows.filter((r) => r.missingRequiredCount > 0);
  }

  if (
    statusFilter === "suggested" ||
    statusFilter === "approved" ||
    statusFilter === "rejected" ||
    statusFilter === "applied"
  ) {
    rows = rows.filter((r) => r.status === statusFilter);
  }

  return NextResponse.json({
    importJobId: params.id,
    total: rows.length,
    truncated: suggestions.length >= 1000,
    rows
  });
}
