/** Roller: owner hariç mağaza içinde düzenlenebilir. */
export const RBAC_EDITABLE_ROLE_KEYS = [
  "admin",
  "editor",
  "pricing_manager",
  "order_manager",
  "support",
  "viewer",
  "manager",
  "staff"
] as const;

/** Rol matrisinde atanması desteklenmeyen (sistem) izinler. */
export const RBAC_PERMISSION_EXCLUDE_FOR_ROLES = new Set([
  "owner.manage",
  "billing.manage"
]);

/** Kullanıcı bazlı override listesinde kullanılabilecek izin anahtarları (owner.manage/billing hariç). */
export function isAssignableToMembership(permissionKey: string): boolean {
  return !RBAC_PERMISSION_EXCLUDE_FOR_ROLES.has(permissionKey);
}

/**
 * Sadece mağaza sahibi başka kullanıcılara bu izni override ile verebilir.
 */
export const RBAC_OWNER_ONLY_DELEGATION_KEYS = new Set(["store.rbac.manage"]);

export const RBAC_PERMISSION_LABELS_TR: Record<string, string> = {
  "owner.manage": "Owner özel yönetim",
  "billing.manage": "Faturalama",
  "store.settings.manage": "Mağaza ayarları",
  "marketplace.integrations.manage": "Pazaryeri entegrasyonları",
  "reports.view": "Raporlar",
  "products.create": "Ürün oluşturma",
  "products.view": "Ürünleri görüntüleme",
  "products.update": "Ürün güncelleme",
  "products.archive": "Ürün arşivleme",
  "marketplace.publish": "Pazaryerine yayınlama",
  "marketplace.unpublish": "Yayından kaldırma",
  "pricing.update": "Fiyat/stok güncelleme",
  "store.users.manage": "Mağaza kullanıcıları",
  "store.rbac.manage": "Yetki ve menü yönetimi",
  "orders.view": "Siparişleri görüntüleme",
  "orders.manage": "Sipariş yönetimi",
  "imports.manage": "Dosya içe aktarma",
  "feeds.manage": "XML beslemeler"
};

export function permissionLabelTr(key: string): string {
  return RBAC_PERMISSION_LABELS_TR[key] ?? key;
}
