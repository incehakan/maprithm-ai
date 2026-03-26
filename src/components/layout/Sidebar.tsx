import Link from "next/link";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissionClient";

type NavItem = {
  href: string;
  label: string;
  /** Tanımlı değilse tüm mağaza üyelerine görünür. */
  permission?: string;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/orders", label: "Siparişler", permission: "orders.view" },
  { href: "/products", label: "Ürünler", permission: "products.view" },
  { href: "/imports", label: "Dosya İçe Aktar", permission: "imports.manage" },
  { href: "/xml-feeds", label: "XML Beslemeler", permission: "feeds.manage" },
  {
    href: "/trendyol/publish-readiness",
    label: "Trendyol yayın hazırlık",
    permission: "marketplace.publish"
  },
  {
    href: "/trendyol/publish-jobs",
    label: "Trendyol batch işleri",
    permission: "marketplace.publish"
  },
  { href: "/products/health", label: "Ürün Sağlık", permission: "products.view" },
  { href: "/ai-product", label: "AI Ürün Oluştur", permission: "products.create" },
  { href: "/settings", label: "Ayarlar", permission: "store.settings.manage" },
  { href: "/store", label: "Mağaza" }
];

export async function Sidebar() {
  const session = await auth();
  const permissionKeys = session?.permissionKeys ?? [];
  const canManageUsers = hasPermission(permissionKeys, "store.users.manage");
  const canManageRbac = hasPermission(permissionKeys, "store.rbac.manage");

  const filteredNav = navItems.filter((item) =>
    item.permission ? hasPermission(permissionKeys, item.permission) : true
  );

  const withUsers = [
    ...filteredNav,
    ...(canManageRbac
      ? [{ href: "/store/permissions", label: "Yetki yönetimi" as const }]
      : []),
    ...(canManageUsers
      ? [{ href: "/store/users", label: "Mağaza Kullanıcıları" as const }]
      : [])
  ];

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-slate-800 bg-sidebar text-slate-100">
      <div className="px-6 py-4 text-sm font-semibold">
        Maprithm Ticaret AI
      </div>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {withUsers.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
