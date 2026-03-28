const { PrismaClient } = require("@prisma/client");

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function upsertPermission(prisma, { key, name, description }) {
  return prisma.permission.upsert({
    where: { key },
    create: { key, name, description },
    update: { name, description }
  });
}

async function upsertRole(prisma, { key, name, description }) {
  return prisma.role.upsert({
    where: { key },
    create: { key, name, description },
    update: { name, description }
  });
}

async function main() {
  const prisma = new PrismaClient();

  const permissions = [
    {
      key: "owner.manage",
      name: "Owner özel yönetim",
      description: "Sadece owner’a özel kritik işlemler"
    },
    {
      key: "billing.manage",
      name: "Faturalama yönetimi",
      description: "Plan/ödeme/faturalama işlemleri (owner özel)"
    },
    {
      key: "store.settings.manage",
      name: "Mağaza ayarlarını yönet",
      description: "Mağaza ayarlarını değiştirme"
    },
    {
      key: "marketplace.integrations.manage",
      name: "Pazaryeri entegrasyonlarını yönet",
      description: "Marketplace bağlantıları ve entegrasyon ayarları"
    },
    {
      key: "reports.view",
      name: "Raporları görüntüle",
      description: "Satış/performans raporlarını görüntüleme"
    },
    {
      key: "products.create",
      name: "Ürün oluşturma",
      description: "Ürün oluşturma / importtan ürün oluşturma"
    },
    {
      key: "marketplace.publish",
      name: "Pazaryerine yayınlama",
      description: "Pazaryerine yayınla, yayından kaldır, arşiv işlemleri"
    },
    {
      key: "store.users.manage",
      name: "Mağaza kullanıcılarını yönet",
      description: "Üye davet etme, rol atama, üyelik yönetimi"
    },
    {
      key: "orders.view",
      name: "Siparişleri görüntüle",
      description: "Pazaryeri sipariş listesi ve detay"
    },
    {
      key: "orders.manage",
      name: "Sipariş senkronu ve yönetim",
      description: "Trendyol sipariş çekme ve ileride paket aksiyonları"
    },
    {
      key: "returns.view",
      name: "İadeleri görüntüle",
      description: "Pazaryeri iade talepleri listesi ve detay"
    },
    {
      key: "returns.manage",
      name: "İade işlemleri",
      description: "İade senkronu, onay ve red işlemleri"
    },
    {
      key: "products.view",
      name: "Ürünleri görüntüle",
      description: "Ürün listesi ve detay ekranları"
    },
    {
      key: "products.update",
      name: "Ürün güncelle",
      description: "Ürün düzenleme, görsel ve fiyat alanları"
    },
    {
      key: "products.archive",
      name: "Ürün arşivle",
      description: "Ürünü arşivle / yaşam döngüsü"
    },
    {
      key: "imports.manage",
      name: "İçe aktarma yönetimi",
      description: "Dosya içe aktarma işleri ve listesi"
    },
    {
      key: "feeds.manage",
      name: "XML feed yönetimi",
      description: "XML besleme kaynakları ve senkron"
    },
    {
      key: "marketplace.unpublish",
      name: "Pazaryerinde yayından kaldır",
      description: "Yayındaki ilanı pazaryerinde pasifleştirme"
    },
    {
      key: "pricing.update",
      name: "Fiyat ve stok API güncellemesi",
      description: "Pazaryeri fiyat/stok güncelleme çağrıları"
    },
    {
      key: "store.rbac.manage",
      name: "Yetki ve menü yönetimi",
      description: "Mağaza içinde rol ve kullanıcı izinlerini düzenleme (owner devredebilir)"
    }
  ];

  const roles = [
    {
      key: "owner",
      name: "Sahip",
      description: "Tüm izinler"
    },
    {
      key: "admin",
      name: "Admin",
      description: "Mağaza yönetimi ve operasyon"
    },
    {
      key: "editor",
      name: "Editor",
      description: "Ürün yönetimi"
    },
    {
      key: "pricing_manager",
      name: "Pricing Manager",
      description: "Fiyat yönetimi"
    },
    {
      key: "order_manager",
      name: "Order Manager",
      description: "Sipariş yönetimi"
    },
    {
      key: "support",
      name: "Support",
      description: "Müşteri destek"
    },
    {
      key: "viewer",
      name: "Viewer",
      description: "Sadece görüntüleme"
    },
    {
      key: "manager",
      name: "Yönetici",
      description: "Ürün ve pazaryeri işlemleri"
    },
    {
      key: "staff",
      name: "Personel",
      description: "Sınırlı erişim"
    }
  ];

  await prisma.$transaction(async (tx) => {
    const permRecords = [];
    for (const p of permissions) permRecords.push(await upsertPermission(tx, p));

    const roleRecords = {};
    for (const r of roles) roleRecords[r.key] = await upsertRole(tx, r);

    const byKey = Object.fromEntries(permRecords.map((p) => [p.key, p]));

    const ownerPerms = permissions.map((p) => p.key);
    const adminPerms = [
      "store.settings.manage",
      "marketplace.integrations.manage",
      "reports.view",
      "products.view",
      "products.create",
      "products.update",
      "products.archive",
      "imports.manage",
      "feeds.manage",
      "marketplace.publish",
      "marketplace.unpublish",
      "pricing.update",
      "store.users.manage",
      "orders.view",
      "orders.manage",
      "returns.view",
      "returns.manage"
    ];
    // Owner-only: billing.manage, owner.manage
    const editorPerms = [
      "products.view",
      "products.create",
      "products.update",
      "products.archive",
      "imports.manage",
      "feeds.manage",
      "marketplace.publish",
      "marketplace.unpublish",
      "pricing.update",
      "orders.view",
      "returns.view"
    ];
    const pricingPerms = [
      "reports.view",
      "products.view",
      "orders.view",
      "returns.view",
      "pricing.update",
      "marketplace.publish",
      "marketplace.unpublish"
    ];
    const orderPerms = [
      "reports.view",
      "products.view",
      "orders.view",
      "orders.manage",
      "returns.view",
      "returns.manage"
    ];
    const supportPerms = ["reports.view", "products.view", "orders.view", "returns.view"];
    const viewerPerms = ["reports.view", "products.view", "orders.view", "returns.view"];
    const managerPerms = [
      "products.view",
      "products.create",
      "products.update",
      "products.archive",
      "imports.manage",
      "feeds.manage",
      "marketplace.publish",
      "marketplace.unpublish",
      "pricing.update",
      "orders.view",
      "returns.view"
    ];
    const staffPerms = [];

    const rolePermMap = [
      { role: "owner", keys: ownerPerms },
      { role: "admin", keys: adminPerms },
      { role: "editor", keys: editorPerms },
      { role: "pricing_manager", keys: pricingPerms },
      { role: "order_manager", keys: orderPerms },
      { role: "support", keys: supportPerms },
      { role: "viewer", keys: viewerPerms },
      { role: "manager", keys: managerPerms },
      { role: "staff", keys: staffPerms }
    ];

    for (const { role, keys } of rolePermMap) {
      const roleId = roleRecords[role].id;
      for (const permKey of keys) {
        const permissionId = byKey[permKey].id;
        await tx.rolePermission.upsert({
          where: {
            roleId_permissionId: { roleId, permissionId }
          },
          create: { roleId, permissionId },
          update: {}
        });
      }
    }

    const users = await tx.user.findMany({
      select: { id: true, email: true }
    });

    for (const user of users) {
      const existingMembership = await tx.storeMembership.findFirst({
        where: { userId: user.id }
      });

      let storeId = existingMembership?.storeId;
      let membershipId = existingMembership?.id;

      if (!storeId) {
        const baseSlug = slugify(user.email.split("@")[0]) || "store";
        let slug = baseSlug;
        for (let i = 0; i < 20; i++) {
          const conflict = await tx.store.findUnique({ where: { slug } });
          if (!conflict) break;
          slug = `${baseSlug}-${i + 1}`;
        }

        const store = await tx.store.create({
          data: {
            name: `${user.email} mağazası`,
            slug
          }
        });

        storeId = store.id;

        const membership = await tx.storeMembership.create({
          data: {
            storeId,
            userId: user.id,
            roleId: roleRecords.owner.id,
            isActive: true
          }
        });

        membershipId = membership.id;
      }

      // Phase-2: storeId is NOT NULL everywhere. Data backfill is handled by migrations.
      // Keep seed focused on ensuring roles/permissions and default store/membership exist.
    }
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

