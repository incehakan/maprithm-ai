import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isImportUsable } from "@/lib/importStatus";
import { requireActiveStore } from "@/lib/requireActiveStore";

type Params = { params: { id: string } };

/**
 * GET /api/imports/[id]/suggestions
 * id = ImportJob id. Trendyol öneri kayıtlarını (satır bazlı) listeler.
 *
 * Query: importRowId (opsiyonel), limit (varsayılan 50), offset
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
      { error: "Pasif import verisi suggestion listesinde kullanılamaz." },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const importRowId = searchParams.get("importRowId")?.trim();
  const limit = Math.min(
    200,
    Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50)
  );
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

  if (importRowId) {
    const row = await prisma.importRow.findFirst({
      where: {
        id: importRowId,
        importJobId: params.id,
        importJob: { storeId: ctx.storeId }
      }
    });
    if (!row) {
      return NextResponse.json({ error: "Satır bu işe ait değil." }, { status: 404 });
    }
  }

  const where = {
    importRow: {
      importJobId: params.id,
      importJob: { storeId: ctx.storeId }
    },
    ...(importRowId ? { importRowId } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.importRowMarketplaceSuggestion.findMany({
      where,
      include: {
        importRow: { select: { rowIndex: true } },
        suggestedAttributes: {
          orderBy: [{ isRequired: "desc" }, { attributeName: "asc" }]
        }
      },
      orderBy: [{ importRowId: "asc" }, { updatedAt: "desc" }],
      take: limit,
      skip: offset
    }),
    prisma.importRowMarketplaceSuggestion.count({ where })
  ]);

  const suggestions = rows.map((s) => {
    const { importRow, ...rest } = s;
    return {
      ...rest,
      rowIndex: importRow.rowIndex
    };
  });

  return NextResponse.json({
    importJobId: params.id,
    suggestions,
    pagination: { limit, offset, total }
  });
}
