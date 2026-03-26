import { NextResponse } from "next/server";
import { syncTrendyolBatchResultForUser } from "@/lib/trendyolBatchResultSync";
import { requireActiveStore } from "@/lib/requireActiveStore";

type Body = {
  batchRequestId?: string;
};

export async function POST(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: "Geçersiz JSON gövdesi." },
      { status: 400 }
    );
  }

  const batchRequestId =
    typeof body.batchRequestId === "string" ? body.batchRequestId.trim() : "";
  if (!batchRequestId) {
    return NextResponse.json(
      { error: "batchRequestId zorunludur." },
      { status: 400 }
    );
  }

  const result = await syncTrendyolBatchResultForUser(ctx.userId, ctx.storeId, batchRequestId);

  if (!result.ok) {
    const reason = result.failReason;
    const status =
      reason === "no_mappings"
        ? 404
        : reason === "no_connection" || reason === "bad_batch_id"
          ? 400
          : 502;
    return NextResponse.json(
      {
        success: false,
        error: result.userMessage,
        failReason: reason,
        batchRequestId,
        mappings: result.mappings
      },
      { status }
    );
  }

  return NextResponse.json({
    success: true,
    batchRequestId,
    message: result.userMessage,
    batch: result.parsed,
    job: result.jobRecord,
    mappings: result.mappings
  });
}
