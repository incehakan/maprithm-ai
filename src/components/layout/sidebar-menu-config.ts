import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Boxes,
  ChevronRight,
  FileUp,
  Gauge,
  PackageSearch,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Users
} from "lucide-react";

export type SidebarMenuLeaf = {
  key: string;
  label: string;
  href: string;
  icon?: LucideIcon;
  permission?: string;
  systemAdminOnly?: boolean;
};

export type SidebarMenuGroup = {
  key: string;
  label: string;
  icon: LucideIcon;
  children: SidebarMenuLeaf[];
};

export type SidebarMenuItem = SidebarMenuLeaf | SidebarMenuGroup;

export function isGroup(item: SidebarMenuItem): item is SidebarMenuGroup {
  return "children" in item;
}

export const sidebarMenuConfig: SidebarMenuItem[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    icon: Gauge
  },
  {
    key: "orders",
    label: "Siparişler",
    href: "/orders",
    icon: ShoppingCart,
    permission: "orders.view"
  },
  {
    key: "returns",
    label: "İadeler",
    href: "/returns",
    icon: RotateCcw,
    permission: "returns.view"
  },
  {
    key: "products",
    label: "Ürünler",
    icon: Boxes,
    children: [
      {
        key: "products-list",
        label: "Ürünler",
        href: "/products",
        permission: "products.view"
      },
      {
        key: "products-health",
        label: "Ürün Sağlık",
        href: "/products/health",
        permission: "products.view"
      },
      {
        key: "products-ai",
        label: "AI Ürün Oluştur",
        href: "/ai-product",
        permission: "products.create"
      },
      {
        key: "products-imports",
        label: "Dosya İçe Aktar",
        href: "/imports",
        permission: "imports.manage"
      }
    ]
  },
  {
    key: "trendyol",
    label: "Trendyol",
    icon: ShieldCheck,
    children: [
      {
        key: "trendyol-readiness",
        label: "Trendyol Yayın Hazırlık",
        href: "/trendyol/publish-readiness",
        permission: "marketplace.publish"
      },
      {
        key: "trendyol-jobs",
        label: "Trendyol Batch İşleri",
        href: "/trendyol/publish-jobs",
        permission: "marketplace.publish"
      }
    ]
  },
  {
    key: "settings",
    label: "Ayarlar",
    icon: Settings,
    children: [
      {
        key: "settings-main",
        label: "Ayarlar",
        href: "/settings",
        permission: "store.settings.manage"
      },
      {
        key: "settings-system-connections",
        label: "Sistem Bağlantıları",
        href: "/admin/system-connections",
        systemAdminOnly: true
      },
      {
        key: "settings-reference-sync",
        label: "Referans Sync Yönetimi",
        href: "/admin/reference-sync",
        systemAdminOnly: true
      },
      {
        key: "settings-rbac",
        label: "Yetki Yönetimi",
        href: "/store/permissions",
        permission: "store.rbac.manage"
      },
      {
        key: "settings-feeds",
        label: "XML Beslemeler",
        href: "/xml-feeds",
        permission: "feeds.manage"
      }
    ]
  },
  {
    key: "store",
    label: "Mağaza",
    icon: Store,
    children: [
      {
        key: "store-main",
        label: "Mağaza",
        href: "/store"
      },
      {
        key: "store-users",
        label: "Mağaza Kullanıcıları",
        href: "/store/users",
        permission: "store.users.manage"
      }
    ]
  }
];

export const sidebarStatusIcon = ChevronRight;

