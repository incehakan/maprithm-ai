import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";

type Params = { params: { membershipId: string } };

export async function POST(_request: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ success: false, error: msg }, { status: 401 });
  }

  try {
    requirePermission(ctx, "store.users.manage");
  } catch {
    return NextResponse.json({ success: false, error: "Erişim yok." }, { status: 403 });
  }

  const membership = await prisma.storeMembership.findFirst({
    where: { id: params.membershipId, storeId: ctx.storeId },
    include: { role: { select: { key: true } }, user: { select: { email: true } } }
  });
  if (!membership) {
    return NextResponse.json({ success: false, error: "Üyelik bulunamadı." }, { status: 404 });
  }
  if (membership.role.key === "owner") {
    return NextResponse.json(
      { success: false, error: "Owner üyeliği pasife alınamaz/aktiflik değiştirilemez." },
      { status: 400 }
    );
  }

  await prisma.storeMembership.update({
    where: { id: membership.id },
    data: { isActive: true }
  });

  await createActivityLog({
    userId: ctx.userId,
    storeId: ctx.storeId,
    membershipId: ctx.membershipId,
    action: "STORE_USER_ACTIVATED",
    entityType: "store_membership",
    entityId: membership.id,
    message: `Mağaza üyeliği aktif edildi: ${membership.user.email}`
  });

  return NextResponse.json({ success: true });
}

