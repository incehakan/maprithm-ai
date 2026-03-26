import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";

type Params = { params: { membershipId: string } };

type PatchBody = {
  roleKey?: unknown;
  overrides?: unknown;
};

const ALLOWED_ROLE_KEYS = new Set([
  "admin",
  "editor",
  "pricing_manager",
  "order_manager",
  "support",
  "viewer"
]);

const ALLOWED_OVERRIDE_KEYS = new Set(["reports.view", "store.settings.manage"]);

export async function PATCH(request: Request, { params }: Params) {
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

  const membershipId = params.membershipId;
  const body = (await request.json().catch(() => null)) as PatchBody | null;
  const roleKey = typeof body?.roleKey === "string" ? body.roleKey.trim() : "";

  const overridesIn = Array.isArray(body?.overrides) ? (body?.overrides as unknown[]) : null;
  const normalizedOverrides: Array<{ permissionKey: string; isAllowed: boolean | null }> = [];
  if (overridesIn) {
    for (const item of overridesIn) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const permissionKey = typeof o.permissionKey === "string" ? o.permissionKey.trim() : "";
      const isAllowedRaw = o.isAllowed;
      if (!ALLOWED_OVERRIDE_KEYS.has(permissionKey)) continue;
      const isAllowed =
        isAllowedRaw === null ? null : typeof isAllowedRaw === "boolean" ? isAllowedRaw : null;
      normalizedOverrides.push({ permissionKey, isAllowed });
    }
  }

  const membership = await prisma.storeMembership.findFirst({
    where: { id: membershipId, storeId: ctx.storeId },
    include: { role: { select: { key: true } }, user: { select: { email: true } } }
  });
  if (!membership) {
    return NextResponse.json({ success: false, error: "Üyelik bulunamadı." }, { status: 404 });
  }
  if (membership.role.key === "owner") {
    return NextResponse.json(
      { success: false, error: "Owner rolü değiştirilemez." },
      { status: 400 }
    );
  }

  // Owner/admin guard rules:
  // - No one can assign owner via this endpoint.
  // - Admin cannot change owner's role (already blocked above).
  // - Admin cannot deactivate owner (handled in activate/deactivate routes).
  const actorMembership = await prisma.storeMembership.findUnique({
    where: { id: ctx.membershipId },
    include: { role: { select: { key: true } } }
  });
  const actorRoleKey = actorMembership?.role?.key ?? null;

  if (roleKey) {
    if (!ALLOWED_ROLE_KEYS.has(roleKey)) {
      return NextResponse.json({ success: false, error: "Geçersiz rol." }, { status: 400 });
    }
    if (roleKey === "owner") {
      return NextResponse.json(
        { success: false, error: "Owner rolü atanamaz." },
        { status: 400 }
      );
    }

    const role = await prisma.role.findUnique({
      where: { key: roleKey },
      select: { id: true, key: true }
    });
    if (!role) {
      return NextResponse.json(
        { success: false, error: "Rol bulunamadı. Seed çalıştırın." },
        { status: 400 }
      );
    }

    await prisma.storeMembership.update({
      where: { id: membershipId },
      data: { roleId: role.id }
    });

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "STORE_USER_ROLE_UPDATED",
      entityType: "store_membership",
      entityId: membershipId,
      message: `Kullanıcı rolü güncellendi: ${membership.user.email} → ${role.key}`
    });
  }

  if (normalizedOverrides.length > 0) {
    // Only owner or admin can change overrides; keep it within store.users.manage scope
    if (!actorRoleKey) {
      return NextResponse.json({ success: false, error: "Yetkisiz." }, { status: 403 });
    }
    if (actorRoleKey !== "owner" && actorRoleKey !== "admin") {
      return NextResponse.json({ success: false, error: "Erişim yok." }, { status: 403 });
    }

    const perms = await prisma.permission.findMany({
      where: { key: { in: normalizedOverrides.map((x) => x.permissionKey) } },
      select: { id: true, key: true }
    });
    const permByKey = new Map(perms.map((p) => [p.key, p.id]));

    for (const o of normalizedOverrides) {
      const permissionId = permByKey.get(o.permissionKey);
      if (!permissionId) continue;

      if (o.isAllowed === null) {
        await prisma.storeMembershipPermissionOverride.deleteMany({
          where: { membershipId, permissionId }
        });
      } else {
        await prisma.storeMembershipPermissionOverride.upsert({
          where: { membershipId_permissionId: { membershipId, permissionId } },
          create: { membershipId, permissionId, isAllowed: o.isAllowed },
          update: { isAllowed: o.isAllowed }
        });
      }
    }

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "STORE_USER_PERMISSION_OVERRIDES_UPDATED",
      entityType: "store_membership",
      entityId: membershipId,
      message: `Kullanıcı izin override'ları güncellendi: ${membership.user.email}`
    });
  }

  return NextResponse.json({ success: true });
}

