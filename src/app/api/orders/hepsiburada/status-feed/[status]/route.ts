/**
 * GET /api/orders/hepsiburada/status-feed/[status]
 * Tamamlayıcı durum bazlı liste (hepsiburadaStatusFeeds) —
 * hepsiburadaOrderSync.ts'e dokunulmaz (bkz. docs/HEPSIBURADA_SYNC_KARAR.md).
 *
 * status: delivered | shipped | undelivered | unpacked | missing-invoice |
 *         cancelled | paymentawaiting | all
 */
import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  fetchHbOrdersAll,
  fetchHbOrdersCancelled,
  fetchHbOrdersPaymentAwaiting,
  fetchHbPackagesDelivered,
  fetchHbPackagesMissingInvoice,
  fetchHbPackagesShipped,
  fetchHbPackagesUndelivered,
  fetchHbPackagesUnpacked,
} from "@/lib/hepsiburadaStatusFeeds";

type Params = { params: { status: string } };

const FEED_MAP: Record<
  string,
  (p: { storeId: string; offset?: number; limit?: number }) => Promise<
    { ok: true; data: unknown } | { ok: false; message: string }
  >
> = {
  all: fetchHbOrdersAll,
  cancelled: fetchHbOrdersCancelled,
  paymentawaiting: fetchHbOrdersPaymentAwaiting,
  delivered: fetchHbPackagesDelivered,
  "missing-invoice": fetchHbPackagesMissingInvoice,
  shipped: fetchHbPackagesShipped,
  unpacked: fetchHbPackagesUnpacked,
  undelivered: fetchHbPackagesUndelivered,
};

export async function GET(request: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: unknown) {
    const msg =
      e instanceof Error && e.message === "NO_ACTIVE_STORE"
        ? "Aktif mağaza yok."
        : "Yetkisiz.";
    return NextResponse.json({ success: false, error: msg }, { status: 401 });
  }
  try {
    requirePermission(ctx, "orders.view");
  } catch {
    return NextResponse.json({ success: false, error: "Erişim yok." }, { status: 403 });
  }

  const statusKey = decodeURIComponent(params.status).trim().toLowerCase();
  const fn = FEED_MAP[statusKey];
  if (!fn) {
    return NextResponse.json(
      {
        success: false,
        error: `Geçersiz status. Geçerli: ${Object.keys(FEED_MAP).join(", ")}`,
      },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const limit = Number(url.searchParams.get("limit") ?? "50");

  const result = await fn({
    storeId: ctx.storeId,
    offset: Number.isFinite(offset) ? offset : 0,
    limit: Number.isFinite(limit) ? limit : 50,
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.message }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    status: statusKey,
    data: result.data,
    note: "Tamamlayıcı feed — ana sync akışı hepsiburadaOrderSync.ts (bkz. HEPSIBURADA_SYNC_KARAR.md).",
  });
}
