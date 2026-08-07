import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Boxes,
  ChevronRight,
  ClipboardCheck,
  Crosshair,
  FileUp,
  Gauge,
  KeyRound,
  Layers,
  LineChart,
  MessageCircle,
  PackageSearch,
  PlugZap,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  TrendingUp,
  UserCog,
  Wallet
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

// ─────────────────────────────────────────────────────────────────────────
// Menü mantığı (son kullanıcı — Trendyol satıcısı — günlük kullanım akışına göre):
//   1) Panel / Siparişler / İadeler → en sık kullanılan, tek tık, üstte
//   2) Ürünler → katalog + XML besleme (ürün verisinin kaynağı burada toplu)
//   3) Trendyol → pazaryeri ile ilgili HER ŞEY tek çatı altında (bağlantı
//      ayarları dahil — önceden sadece Ayarlar sayfasının içinde gömülüydü)
//   4) Raporlar → kârlılık + rekabet (buybox) — karar destek
//   5) Ayarlar → sade: genel iş ayarları + yetki/kullanıcı yönetimi + sistem
//   6) Mağaza → tek link (alt grup gereksizdi)
// ─────────────────────────────────────────────────────────────────────────

export const sidebarMenuConfig: SidebarMenuItem[] = [
  {
    key: "dashboard",
    label: "Panel",
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
        icon: Boxes,
        permission: "products.view"
      },
      {
        key: "products-health",
        label: "Ürün Sağlık",
        href: "/products/health",
        icon: PackageSearch,
        permission: "products.view"
      },
      {
        key: "products-ai",
        label: "AI Ürün Oluştur",
        href: "/ai-product",
        icon: Bot,
        permission: "products.create"
      },
      {
        key: "products-imports",
        label: "Dosya İçe Aktar",
        href: "/imports",
        icon: FileUp,
        permission: "imports.manage"
      },
      {
        key: "products-feeds",
        label: "XML Beslemeler",
        href: "/xml-feeds",
        icon: Layers,
        permission: "feeds.manage"
      }
    ]
  },
  {
    key: "trendyol",
    label: "Trendyol",
    icon: ShieldCheck,
    children: [
      {
        key: "trendyol-settings",
        label: "Trendyol Ayarları",
        href: "/settings/trendyol",
        icon: PlugZap,
        permission: "store.settings.manage"
      },
      {
        key: "trendyol-readiness",
        label: "Yayın Hazırlık",
        href: "/trendyol/publish-readiness",
        icon: ClipboardCheck,
        permission: "marketplace.publish"
      },
      {
        key: "trendyol-jobs",
        label: "Batch İşleri",
        href: "/trendyol/publish-jobs",
        icon: Layers,
        permission: "marketplace.publish"
      },
      {
        key: "trendyol-customer-questions",
        label: "Müşteri Soruları",
        href: "/trendyol/customer-questions",
        icon: MessageCircle,
        permission: "trendyol.questions.view"
      },
      {
        key: "trendyol-finance",
        label: "Cari Ekstre (CHE)",
        href: "/trendyol/finance",
        icon: Wallet,
        permission: "trendyol.finance.view"
      }
    ]
  },
  {
    key: "hepsiburada",
    label: "Hepsiburada",
    icon: Store,
    children: [
      {
        key: "hepsiburada-settings",
        label: "Hepsiburada Ayarları",
        href: "/settings/hepsiburada",
        icon: PlugZap,
        permission: "store.settings.manage"
      },
      {
        key: "hepsiburada-listings",
        label: "Listeler",
        href: "/hepsiburada/listings",
        icon: Layers,
        permission: "marketplace.integrations.manage"
      },
      {
        key: "hepsiburada-campaigns",
        label: "Kampanyalar",
        href: "/hepsiburada/campaigns",
        icon: Wallet,
        permission: "marketplace.integrations.manage"
      },
      {
        key: "hepsiburada-questions",
        label: "Sorular",
        href: "/hepsiburada/questions",
        icon: MessageCircle,
        permission: "marketplace.integrations.manage"
      },
      {
        key: "hepsiburada-products",
        label: "Ürünler",
        href: "/hepsiburada/products",
        icon: Boxes,
        permission: "marketplace.integrations.manage"
      },

      {
        key: "hepsiburada-products-import",
        label: "Ürün İçe Aktar",
        href: "/hepsiburada/products/import",
        icon: FileUp,
        permission: "marketplace.publish"
      },
      {
        key: "hepsiburada-products-tracking",
        label: "Import Tracking",
        href: "/hepsiburada/products/tracking",
        icon: ClipboardCheck,
        permission: "marketplace.integrations.manage"
      }
    ]
  },
  {
    key: "reports",
    label: "Raporlar",
    icon: TrendingUp,
    children: [
      {
        key: "reports-order-profitability",
        label: "Sipariş Kârlılığı",
        href: "/reports/order-profitability",
        icon: LineChart,
        permission: "orders.view"
      },
      {
        key: "reports-buybox",
        label: "Buybox İzleme",
        href: "/reports/buybox",
        icon: Crosshair,
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
        label: "Genel Ayarlar",
        href: "/settings",
        icon: Settings,
        permission: "store.settings.manage"
      },
      {
        key: "settings-users",
        label: "Mağaza Kullanıcıları",
        href: "/store/users",
        icon: UserCog,
        permission: "store.users.manage"
      },
      {
        key: "settings-rbac",
        label: "Yetki Yönetimi",
        href: "/store/permissions",
        icon: KeyRound,
        permission: "store.rbac.manage"
      },
      {
        key: "settings-system-connections",
        label: "Sistem Bağlantıları",
        href: "/admin/system-connections",
        icon: PlugZap,
        systemAdminOnly: true
      },
      {
        key: "settings-reference-sync",
        label: "Referans Senkron Yönetimi",
        href: "/admin/reference-sync",
        icon: Layers,
        systemAdminOnly: true
      }
    ]
  },
  {
    key: "store",
    label: "Mağaza",
    href: "/store",
    icon: Store
  }
];

export const sidebarStatusIcon = ChevronRight;
