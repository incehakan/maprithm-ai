/**
 * Tek seferlik / lokal: belirtilen kullanıcıyı sistem yöneticisi + mağaza sahibi (owner) yapar.
 *
 * Önkoşul: roller ve izinler yüklü olsun → `npx prisma db seed`
 *
 * Güvenlik: Bu dosyada düz şifre vardır. Public repoda tutmayın veya
 * SUPERUSER_EMAIL / SUPERUSER_PASSWORD ortam değişkenleriyle override edin.
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 10;

const DEFAULT_EMAIL = "hakanince10@gmail.com";
const DEFAULT_PASSWORD = "Hkn.100508";

const email = (process.env.SUPERUSER_EMAIL || DEFAULT_EMAIL).trim().toLowerCase();
const password = process.env.SUPERUSER_PASSWORD || DEFAULT_PASSWORD;

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function main() {
  if (!email || !password || password.length < 6) {
    console.error("Geçerli email ve en az 6 karakter şifre gerekli.");
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const ownerRole = await prisma.role.findUnique({
      where: { key: "owner" },
      select: { id: true }
    });
    if (!ownerRole) {
      console.error(
        'Rol "owner" bulunamadı. Önce seed çalıştırın: npx prisma db seed'
      );
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        password: passwordHash,
        isActive: true,
        isSystemAdmin: true
      },
      update: {
        password: passwordHash,
        isActive: true,
        isSystemAdmin: true
      },
      select: { id: true, email: true }
    });

    let membership = await prisma.storeMembership.findFirst({
      where: { userId: user.id, isActive: true },
      orderBy: { createdAt: "asc" }
    });

    if (!membership) {
      const baseSlug = slugify(email.split("@")[0]) || "store";
      let slug = baseSlug;
      for (let i = 0; i < 20; i++) {
        const conflict = await prisma.store.findUnique({ where: { slug } });
        if (!conflict) break;
        slug = `${baseSlug}-${i + 1}`;
      }

      const store = await prisma.store.create({
        data: {
          name: `${email} — süper kullanıcı mağazası`,
          slug
        }
      });

      membership = await prisma.storeMembership.create({
        data: {
          storeId: store.id,
          userId: user.id,
          roleId: ownerRole.id,
          isActive: true
        }
      });

      console.log("Yeni mağaza ve owner üyeliği oluşturuldu:", store.slug);
    } else {
      await prisma.storeMembership.update({
        where: { id: membership.id },
        data: {
          roleId: ownerRole.id,
          isActive: true
        }
      });
      console.log("Mevcut üyelik owner rolüne güncellendi.");
    }

    console.log("Tamam.");
    console.log("  Email:", user.email);
    console.log("  isSystemAdmin: true");
    console.log("  Rol: owner (tüm mağaza izinleri, seed ile uyumlu)");
    console.log("  Oturum: çıkış yapıp yeniden giriş yapın (JWT izinleri yenilensin).");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
