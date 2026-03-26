import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { hashPassword } from "@/lib/password";

type CreateBody = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  roleKey?: unknown;
};

const ALLOWED_ROLE_KEYS = new Set([
  "admin",
  "editor",
  "pricing_manager",
  "order_manager",
  "support",
  "viewer"
]);

export async function GET() {
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

  const rows = await prisma.storeMembership.findMany({
    where: { storeId: ctx.storeId },
    include: {
      user: { select: { id: true, email: true, name: true } },
      role: { select: { key: true, name: true } },
      permissionOverrides: {
        select: { isAllowed: true, permission: { select: { key: true } } }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  return NextResponse.json({
    success: true,
    actorRoleKey: ctx.roleKey,
    users: rows.map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      name: m.user.name ?? null,
      email: m.user.email,
      roleKey: m.role.key,
      roleName: m.role.name,
      isActive: m.isActive,
      createdAt: m.createdAt.toISOString(),
      overrides: Object.fromEntries(
        m.permissionOverrides.map((o) => [o.permission.key, o.isAllowed])
      )
    }))
  });
}

export async function POST(request: Request) {
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

  const body = (await request.json().catch(() => null)) as CreateBody | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const roleKey = typeof body?.roleKey === "string" ? body.roleKey.trim() : "";

  if (!name) {
    return NextResponse.json(
      { success: false, error: "Ad soyad zorunludur." },
      { status: 400 }
    );
  }
  if (!email) {
    return NextResponse.json(
      { success: false, error: "Email zorunludur." },
      { status: 400 }
    );
  }
  if (!password) {
    return NextResponse.json(
      { success: false, error: "Şifre zorunludur." },
      { status: 400 }
    );
  }
  if (!ALLOWED_ROLE_KEYS.has(roleKey)) {
    return NextResponse.json(
      { success: false, error: "Geçersiz rol." },
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

  // Store-first: store admin can create users directly here.
  const hashed = await hashPassword(password);

  const result = await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { email },
      select: { id: true, email: true }
    });

    const user =
      existingUser ??
      (await tx.user.create({
        data: {
          email,
          password: hashed,
          name,
          isActive: true
        },
        select: { id: true, email: true }
      }));

    const existingMembership = await tx.storeMembership.findUnique({
      where: { storeId_userId: { storeId: ctx.storeId, userId: user.id } },
      select: { id: true }
    });
    if (existingMembership) {
      return { userCreated: false, membershipId: existingMembership.id, alreadyMember: true };
    }

    const membership = await tx.storeMembership.create({
      data: {
        storeId: ctx.storeId,
        userId: user.id,
        roleId: role.id,
        isActive: true,
        invitedByUserId: ctx.userId
      },
      select: { id: true }
    });

    return { userCreated: !existingUser, membershipId: membership.id, alreadyMember: false };
  });

  if (result.alreadyMember) {
    return NextResponse.json(
      { success: false, error: "Kullanıcı zaten bu mağazanın üyesi." },
      { status: 409 }
    );
  }

  await createActivityLog({
    userId: ctx.userId,
    storeId: ctx.storeId,
    membershipId: ctx.membershipId,
    action: "STORE_USER_ADDED",
    entityType: "store_membership",
    entityId: result.membershipId,
    message: `Mağazaya kullanıcı eklendi: ${email} (${role.key})`
  });

  return NextResponse.json({
    success: true,
    membershipId: result.membershipId,
    userCreated: result.userCreated
  });
}

