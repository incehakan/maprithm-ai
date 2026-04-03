import { NextResponse } from "next/server";
import { requireActiveStore } from "@/lib/requireActiveStore";
import { validateProductForTrendyolPublish } from "@/lib/validation/prePublishValidator";

type Params = { params: { id: string } };

/**
 * POST — Trendyol yayını öncesi doğrulama (salt okuma; yayın başlatmaz).
 */
export async function POST(_request: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: unknown) {
    const msg =
      e && typeof e === "object" && (e as { message?: string }).message === "NO_ACTIVE_STORE"
        ? "Aktif mağaza yok."
        : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  const result = await validateProductForTrendyolPublish(params.id, {
    userId: ctx.userId,
    storeId: ctx.storeId,
    membershipId: ctx.membershipId,
    permissionKeys: ctx.permissionKeys
  });

  return NextResponse.json(result);
}
