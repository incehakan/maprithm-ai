import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { createActivityLog } from "@/lib/activityLog";

function slugify(input: string) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

type RegisterStoreBody = {
  storeName?: unknown;
  storeSlug?: unknown;
  ownerName?: unknown;
  email?: unknown;
  password?: unknown;
  phone?: unknown;
  currency?: unknown;
  locale?: unknown;
  timezone?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RegisterStoreBody | null;

  const storeName = typeof body?.storeName === "string" ? body.storeName.trim() : "";
  const storeSlugInput =
    typeof body?.storeSlug === "string" ? body.storeSlug.trim() : "";
  const storeSlug = slugify(storeSlugInput || storeName);

  const ownerName = typeof body?.ownerName === "string" ? body.ownerName.trim() : "";
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const currency = typeof body?.currency === "string" && body.currency.trim()
    ? body.currency.trim()
    : "TRY";
  const locale = typeof body?.locale === "string" && body.locale.trim()
    ? body.locale.trim()
    : "tr-TR";
  const timezone = typeof body?.timezone === "string" && body.timezone.trim()
    ? body.timezone.trim()
    : "Europe/Istanbul";

  // phone is optional and currently not persisted (no field in schema)
  const _phone = typeof body?.phone === "string" ? body.phone.trim() : "";

  if (!storeName) {
    return NextResponse.json(
      { success: false, error: "Mağaza adı zorunludur." },
      { status: 400 }
    );
  }
  if (!storeSlug) {
    return NextResponse.json(
      { success: false, error: "Mağaza slug zorunludur." },
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

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: "Bu email ile zaten kullanıcı var." },
        { status: 409 }
      );
    }

    const existingSlug = await prisma.store.findUnique({
      where: { slug: storeSlug },
      select: { id: true }
    });
    if (existingSlug) {
      return NextResponse.json(
        { success: false, error: "Bu mağaza slug zaten kullanılıyor." },
        { status: 409 }
      );
    }

    const ownerRole = await prisma.role.findUnique({
      where: { key: "owner" },
      select: { id: true }
    });
    if (!ownerRole) {
      return NextResponse.json(
        { success: false, error: "Owner rolü bulunamadı. Seed çalıştırın." },
        { status: 400 }
      );
    }

    const hashed = await hashPassword(password);

    const result = await prisma.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          name: storeName,
          slug: storeSlug,
          status: "active",
          currency,
          locale,
          timezone
        },
        select: { id: true, slug: true }
      });

      const user = await tx.user.create({
        data: {
          email,
          password: hashed,
          name: ownerName || null
        },
        select: { id: true, email: true }
      });

      const membership = await tx.storeMembership.create({
        data: {
          storeId: store.id,
          userId: user.id,
          roleId: ownerRole.id,
          isActive: true,
          invitedByUserId: null
        },
        select: { id: true }
      });

      return { store, user, membership };
    });

    // Activity logs (best-effort; do not fail registration)
    await Promise.allSettled([
      createActivityLog({
        userId: result.user.id,
        storeId: result.store.id,
        membershipId: result.membership.id,
        action: "STORE_CREATED",
        entityType: "store",
        entityId: result.store.id,
        message: `Mağaza oluşturuldu: ${storeName} (${result.store.slug})`
      }),
      createActivityLog({
        userId: result.user.id,
        storeId: result.store.id,
        membershipId: result.membership.id,
        action: "OWNER_USER_CREATED",
        entityType: "user",
        entityId: result.user.id,
        message: `Owner kullanıcı oluşturuldu: ${email}`
      }),
      createActivityLog({
        userId: result.user.id,
        storeId: result.store.id,
        membershipId: result.membership.id,
        action: "OWNER_MEMBERSHIP_CREATED",
        entityType: "store_membership",
        entityId: result.membership.id,
        message: "Owner üyeliği oluşturuldu."
      })
    ]);

    return NextResponse.json(
      {
        success: true,
        storeId: result.store.id,
        storeSlug: result.store.slug,
        userId: result.user.id,
        membershipId: result.membership.id
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("register-store error", err);
    return NextResponse.json(
      { success: false, error: "Mağaza oluşturulurken bir hata oluştu." },
      { status: 500 }
    );
  }
}

