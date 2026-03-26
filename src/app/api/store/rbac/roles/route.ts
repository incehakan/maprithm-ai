import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  RBAC_EDITABLE_ROLE_KEYS,
  RBAC_PERMISSION_EXCLUDE_FOR_ROLES
} from "@/lib/rbacCatalog";

type Body = {
  roleKey?: unknown;
  permissionKey?: unknown;
  mode?: unknown;
};

export async function PATCH(request: Request) {
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
    requirePermission(ctx, "store.rbac.manage");
  } catch {
    return NextResponse.json({ success: false, error: "Erişim yok." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const roleKey =
    typeof body?.roleKey === "string" ? body.roleKey.trim() : "";
  const permissionKey =
    typeof body?.permissionKey === "string" ? body.permissionKey.trim() : "";
  const mode = typeof body?.mode === "string" ? body.mode.trim() : "";

  if (!roleKey || !permissionKey || !mode) {
    return NextResponse.json(
      { success: false, error: "roleKey, permissionKey ve mode gerekli." },
      { status: 400 }
    );
  }

  if (roleKey === "owner") {
    return NextResponse.json(
      { success: false, error: "Owner rolü bu ekrandan değiştirilemez." },
      { status: 400 }
    );
  }

  if (!(RBAC_EDITABLE_ROLE_KEYS as readonly string[]).includes(roleKey)) {
    return NextResponse.json(
      { success: false, error: "Bu rol düzenlenemez." },
      { status: 400 }
    );
  }

  if (RBAC_PERMISSION_EXCLUDE_FOR_ROLES.has(permissionKey)) {
    return NextResponse.json(
      { success: false, error: "Bu izin rol matrisine eklenemez." },
      { status: 400 }
    );
  }

  if (!["inherit", "grant", "deny"].includes(mode)) {
    return NextResponse.json({ success: false, error: "Geçersiz mode." }, { status: 400 });
  }

  const [role, permission] = await Promise.all([
    prisma.role.findUnique({
      where: { key: roleKey },
      select: { id: true }
    }),
    prisma.permission.findUnique({
      where: { key: permissionKey },
      select: { id: true }
    })
  ]);

  if (!role || !permission) {
    return NextResponse.json(
      { success: false, error: "Rol veya izin bulunamadı." },
      { status: 400 }
    );
  }

  await prisma.storeRolePermission.deleteMany({
    where: {
      storeId: ctx.storeId,
      roleId: role.id,
      permissionId: permission.id
    }
  });

  if (mode === "grant" || mode === "deny") {
    await prisma.storeRolePermission.create({
      data: {
        storeId: ctx.storeId,
        roleId: role.id,
        permissionId: permission.id,
        isGranted: mode === "grant"
      }
    });
  }

  await createActivityLog({
    userId: ctx.userId,
    storeId: ctx.storeId,
    membershipId: ctx.membershipId,
    action: "STORE_RBAC_ROLE_PERMISSION",
    entityType: "store_role_permission",
    entityId: role.id,
    message: `Rol izni: ${roleKey} / ${permissionKey} → ${mode}`
  });

  return NextResponse.json({ success: true });
}
