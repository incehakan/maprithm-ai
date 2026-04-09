import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore } from "@/lib/requireActiveStore";
import {
  detectSourceTypeFromFileName,
  MAX_ROWS,
  parseImportBuffer,
  type ParsedImportRecord
} from "@/lib/importFileParser";
import { buildImportRowPayloads } from "@/lib/importJobProcessing";

export const runtime = "nodejs";
/** Büyük dosya + çok satır: parse + DB batch; platform üst sınırına göre kısılır. */
export const maxDuration = 900;

/** Prisma varsayılan interactive transaction timeout 5s; çok satırda createMany döngüsü yetmez. */
const IMPORT_PERSIST_TX_MS = 15 * 60 * 1000;

/** CSV / XLSX / XML içe aktarma tek dosya üst sınırı (self-hosted + ters vekil client_max_body_size ile uyumlu olmalı). */
const MAX_FILE_BYTES = 500 * 1024 * 1024;

export async function POST(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ success: false, message: msg }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, message: "Form verisi okunamadı." },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { success: false, message: "Dosya gerekli (file)." },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        success: false,
        message: `Dosya çok büyük (max ${MAX_FILE_BYTES / (1024 * 1024)} MB).`
      },
      { status: 400 }
    );
  }

  const originalFileName = file.name || "upload";
  const manualType = String(form.get("sourceType") ?? "").toLowerCase().trim();
  const detected = detectSourceTypeFromFileName(originalFileName);

  let sourceType: "csv" | "xlsx" | "xml";
  if (manualType === "csv" || manualType === "xlsx" || manualType === "xml") {
    sourceType = manualType;
  } else if (detected) {
    sourceType = detected;
  } else {
    return NextResponse.json(
      {
        success: false,
        message:
          "Kaynak tipi algılanamadı. .csv, .xlsx, .xls veya .xml yükleyin veya sourceType gönderin."
      },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let records: ParsedImportRecord[];
  try {
    records = parseImportBuffer(buffer, sourceType);
  } catch (e) {
    console.error("parseImportBuffer:", e);
    return NextResponse.json(
      {
        success: false,
        message:
          e instanceof Error
            ? e.message
            : "Dosya ayrıştırılırken hata oluştu."
      },
      { status: 400 }
    );
  }

  if (records.length === 0) {
    return NextResponse.json(
      { success: false, message: "Dosyada içe aktarılacak satır bulunamadı." },
      { status: 400 }
    );
  }

  const cappedNote =
    records.length >= MAX_ROWS
      ? `İlk ${MAX_ROWS} satır alındı (üst sınır).`
      : undefined;

  const rawOverride = String(form.get("overrideBrandName") ?? "").trim();
  const overrideBrandName =
    rawOverride.length > 0 ? rawOverride.slice(0, 500) : null;

  const job = await prisma.importJob.create({
    data: {
      userId: ctx.userId,
      storeId: ctx.storeId,
      sourceType,
      originalFileName,
      status: "processing",
      totalRows: 0,
      successRows: 0,
      failedRows: 0,
      overrideBrandName
    }
  });

  try {
    const { payloads: rowPayloads, totalRows, successRows, failedRows } =
      buildImportRowPayloads(job.id, records, {
        overrideBrand: overrideBrandName
      });

    await prisma.$transaction(
      async (tx) => {
        const BATCH = 200;
        for (let i = 0; i < rowPayloads.length; i += BATCH) {
          const chunk = rowPayloads.slice(i, i + BATCH);
          await tx.importRow.createMany({ data: chunk });
        }
        await tx.importJob.updateMany({
          where: { id: job.id, storeId: ctx.storeId },
          data: {
            status: "completed",
            totalRows,
            successRows,
            failedRows
          }
        });
      },
      {
        timeout: IMPORT_PERSIST_TX_MS,
        maxWait: 60_000
      }
    );

    const updated = await prisma.importJob.findFirst({
      where: { id: job.id, storeId: ctx.storeId }
    });

    return NextResponse.json({
      success: true,
      message: "İçe aktarma işi oluşturuldu.",
      job: updated,
      note: cappedNote
    });
  } catch (e) {
    console.error("import job persist error:", e);
    await prisma.importJob.updateMany({
      where: { id: job.id, storeId: ctx.storeId },
      data: {
        status: "failed",
        totalRows: 0,
        successRows: 0,
        failedRows: 0
      }
    });
    return NextResponse.json(
      {
        success: false,
        message:
          e instanceof Error
            ? e.message
            : "Kayıt sırasında hata oluştu."
      },
      { status: 500 }
    );
  }
}
