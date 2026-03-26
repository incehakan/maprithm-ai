import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { getEffectivePermissions } from "@/lib/effectivePermissions";
import {
  RBAC_EDITABLE_ROLE_KEYS,
  RBAC_PERMISSION_EXCLUDE_FOR_ROLES,
  permissionLabelTr
} from "@/lib/rbacCatalog";

export async function GET() {
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

  try {
    const allPerms = await prisma.permission.findMany({
    orderBy: { key: "asc" }
    });

    const assignableForRoles = allPerms.filter(
      (p) => !RBAC_PERMISSION_EXCLUDE_FOR_ROLES.has(p.key)
    );

    const assignableForMembership = allPerms.filter(
      (p) => !RBAC_PERMISSION_EXCLUDE_FOR_ROLES.has(p.key)
    );

    const roles = await prisma.role.findMany({
    where: { key: { in: [...RBAC_EDITABLE_ROLE_KEYS] } },
    include: {
      rolePermissions: {
        select: { permission: { select: { key: true } } }
      }
    },
    orderBy: { key: "asc" }
    });

    const overlays = await prisma.storeRolePermission.findMany({
    where: { storeId: ctx.storeId },
    include: {
      permission: { select: { key: true } },
      role: { select: { key: true, id: true } }
    }
    });

    const overlayModeByRoleKey = new Map<
      string,
      Map<string, "grant" | "deny">
    >();

    for (const o of overlays) {
      const rk = o.role.key;
      if (!overlayModeByRoleKey.has(rk)) {
        overlayModeByRoleKey.set(rk, new Map());
      }
      overlayModeByRoleKey.get(rk)!.set(
        o.permission.key,
        o.isGranted ? "grant" : "deny"
      );
    }

    const roleMatrix = roles.map((role) => {
    const globalKeys = new Set(
      role.rolePermissions.map((rp) => rp.permission.key)
    );
    const ovr = overlayModeByRoleKey.get(role.key) ?? new Map();
    const permissions: Record<
      string,
      { mode: "inherit" | "grant" | "deny"; global: boolean }
    > = {};

    for (const p of assignableForRoles) {
      const key = p.key;
      if (!ovr.has(key)) {
        permissions[key] = { mode: "inherit", global: globalKeys.has(key) };
      } else {
        permissions[key] = {
          mode: ovr.get(key)!,
          global: globalKeys.has(key)
        };
      }
    }

    return {
      key: role.key,
      name: role.name,
      permissions
    };
    });

    const overlaysByRoleId = new Map<
      string,
      { permissionKey: string; isGranted: boolean }[]
    >();
    for (const o of overlays) {
      if (!overlaysByRoleId.has(o.roleId)) {
        overlaysByRoleId.set(o.roleId, []);
      }
      overlaysByRoleId.get(o.roleId)!.push({
        permissionKey: o.permission.key,
        isGranted: o.isGranted
      });
    }

    const membersRaw = await prisma.storeMembership.findMany({
    where: { storeId: ctx.storeId },
    include: {
      user: { select: { email: true, name: true } },
      role: {
        select: {
          id: true,
          key: true,
          name: true,
          rolePermissions: {
            select: { permission: { select: { key: true } } }
          }
        }
      },
      permissionOverrides: {
        select: { isAllowed: true, permission: { select: { key: true } } }
      }
    },
    orderBy: { createdAt: "asc" }
    });

    const members = membersRaw.map((m) => {
    const storeOv =
      m.role.key === "owner"
        ? []
        : (overlaysByRoleId.get(m.roleId) ?? []);

    const effectiveKeys = getEffectivePermissions(
      {
        role: {
          key: m.role.key,
          rolePermissions: m.role.rolePermissions
        },
        permissionOverrides: m.permissionOverrides
      },
      storeOv
    );

    const overrideEntries = Object.fromEntries(
      m.permissionOverrides.map((o) => [o.permission.key, o.isAllowed])
    );

    return {
      membershipId: m.id,
      userId: m.userId,
      email: m.user.email,
      name: m.user.name ?? null,
      roleKey: m.role.key,
      roleName: m.role.name,
      isActive: m.isActive,
      effectivePermissionKeys: effectiveKeys,
      overrides: overrideEntries
    };
    });

    return NextResponse.json({
      success: true,
      actorRoleKey: ctx.roleKey,
      permissionCatalog: assignableForMembership.map((p) => ({
        key: p.key,
        name: p.name,
        labelTr: permissionLabelTr(p.key)
      })),
      roleMatrix,
      members
    });
  } catch (err) {
    console.error("GET /api/store/rbac failed:", err);
    const msg = err instanceof Error ? err.message : "Sunucu hatası.";
    const hint =
      msg.includes("StoreRolePermission") ||
      msg.includes("does not exist") ||
      msg.includes("does not match any query")
        ? " Veritabanı şeması veya Prisma Client güncel değil: proje kökünde `npx prisma migrate deploy` ve `npx prisma generate` çalıştırıp dev sunucuyu tamamen durdurup yeniden başlatın."
        : "";
    return NextResponse.json(
      { success: false, error: `${msg}${hint}` },
      { status: 500 }
    );
  }
}
