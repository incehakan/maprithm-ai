import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore } from "@/lib/requireActiveStore";
import {
  confidenceBand,
  countMissingRequiredAttributes
} from "@/lib/importTrendyolSuggestionUtils";
import { isImportUsable } from "@/lib/importStatus";

type Params = { params: { id: string } };

function readAttributeReasonMap(
  missingRequiredAttributes: unknown
): Record<string, string> {
  if (
    missingRequiredAttributes == null ||
    typeof missingRequiredAttributes !== "object"
  ) {
    return {};
  }
  const raw = (missingRequiredAttributes as Record<string, unknown>).attributeReasons;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
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

  const job = await prisma.importJob.findFirst({
    where: { id: params.id, userId: ctx.userId, storeId: ctx.storeId }
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
      importRow: {
        importJobId: params.id,
        importJob: { storeId: ctx.storeId }
      }
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
    const attrReasonMap = readAttributeReasonMap(s.missingRequiredAttributes);
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
      suggestedAttributes: s.suggestedAttributes.map((a) => ({
        ...a,
        matchReason:
          attrReasonMap[String(a.attributeId)] ??
          attrReasonMap[String(a.id)] ??
          null
      }))
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
