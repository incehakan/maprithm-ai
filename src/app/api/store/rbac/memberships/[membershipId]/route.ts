import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  isAssignableToMembership,
  RBAC_OWNER_ONLY_DELEGATION_KEYS
} from "@/lib/rbacCatalog";

type Params = { params: { membershipId: string } };

type PatchBody = { overrides?: unknown };

export async function PATCH(request: Request, { params }: Params) {
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

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  const raw = Array.isArray(body?.overrides) ? body!.overrides : [];

  const normalized: Array<{ permissionKey: string; isAllowed: boolean | null }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const permissionKey =
      typeof o.permissionKey === "string" ? o.permissionKey.trim() : "";
    if (!permissionKey) continue;
    if (!("isAllowed" in o)) continue;
    const v = o.isAllowed;
    if (v !== null && typeof v !== "boolean") continue;
    normalized.push({ permissionKey, isAllowed: v });
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
      { success: false, error: "Owner üyeliğine özel izin uygulanamaz." },
      { status: 400 }
    );
  }

  for (const o of normalized) {
    if (!isAssignableToMembership(o.permissionKey)) {
      return NextResponse.json(
        { success: false, error: `İzin atanamaz: ${o.permissionKey}` },
        { status: 400 }
      );
    }
    if (
      RBAC_OWNER_ONLY_DELEGATION_KEYS.has(o.permissionKey) &&
      ctx.roleKey !== "owner"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `"${o.permissionKey}" yalnızca mağaza sahibi devredebilir.`
        },
        { status: 403 }
      );
    }
  }

  const permRecords = await prisma.permission.findMany({
    where: { key: { in: normalized.map((x) => x.permissionKey) } },
    select: { id: true, key: true }
  });
  const permByKey = new Map(permRecords.map((p) => [p.key, p.id]));

  for (const o of normalized) {
    const permissionId = permByKey.get(o.permissionKey);
    if (!permissionId) {
      return NextResponse.json(
        { success: false, error: `Bilinmeyen izin: ${o.permissionKey}` },
        { status: 400 }
      );
    }

    if (o.isAllowed === null) {
      await prisma.storeMembershipPermissionOverride.deleteMany({
        where: { membershipId: params.membershipId, permissionId }
      });
    } else {
      await prisma.storeMembershipPermissionOverride.upsert({
        where: {
          membershipId_permissionId: {
            membershipId: params.membershipId,
            permissionId
          }
        },
        create: {
          membershipId: params.membershipId,
          permissionId,
          isAllowed: o.isAllowed
        },
        update: { isAllowed: o.isAllowed }
      });
    }
  }

  await createActivityLog({
    userId: ctx.userId,
    storeId: ctx.storeId,
    membershipId: ctx.membershipId,
    action: "STORE_RBAC_MEMBERSHIP_OVERRIDES",
    entityType: "store_membership",
    entityId: params.membershipId,
    message: `Kullanıcı izinleri (RBAC): ${membership.user.email}`
  });

  return NextResponse.json({ success: true });
}
