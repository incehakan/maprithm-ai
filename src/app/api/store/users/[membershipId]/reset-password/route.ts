import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { hashPassword } from "@/lib/password";
import { createActivityLog } from "@/lib/activityLog";

type Params = { params: { membershipId: string } };

type Body = {
  newPassword?: unknown;
};

export async function POST(request: Request, { params }: Params) {
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

  const body = (await request.json().catch(() => null)) as Body | null;
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (!newPassword) {
    return NextResponse.json(
      { success: false, error: "Yeni şifre zorunludur." },
      { status: 400 }
    );
  }
  if (newPassword.length < 6) {
    return NextResponse.json(
      { success: false, error: "Yeni şifre en az 6 karakter olmalıdır." },
      { status: 400 }
    );
  }

  const targetMembership = await prisma.storeMembership.findFirst({
    where: { id: params.membershipId, storeId: ctx.storeId },
    include: { role: { select: { key: true } }, user: { select: { id: true, email: true } } }
  });
  if (!targetMembership) {
    return NextResponse.json(
      { success: false, error: "Üyelik bulunamadı." },
      { status: 404 }
    );
  }

  // Guard rules:
  // - Owner hesabının şifresi bu ekrandan değiştirilemesin (kritik hesap güvenliği).
  // - Admin, owner’a işlem yapamasın.
  if (targetMembership.role.key === "owner") {
    return NextResponse.json(
      { success: false, error: "Owner hesabının şifresi buradan değiştirilemez." },
      { status: 400 }
    );
  }

  const actorMembership = await prisma.storeMembership.findUnique({
    where: { id: ctx.membershipId },
    include: { role: { select: { key: true } } }
  });
  const actorRoleKey = actorMembership?.role?.key ?? null;
  if (!actorRoleKey) {
    return NextResponse.json({ success: false, error: "Yetkisiz." }, { status: 403 });
  }

  const hashed = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: targetMembership.user.id },
    data: { password: hashed }
  });

  await createActivityLog({
    userId: ctx.userId,
    storeId: ctx.storeId,
    membershipId: ctx.membershipId,
    action: "STORE_USER_PASSWORD_RESET",
    entityType: "store_membership",
    entityId: targetMembership.id,
    message: `Kullanıcı şifresi sıfırlandı: ${targetMembership.user.email}`
  });

  return NextResponse.json({ success: true });
}

