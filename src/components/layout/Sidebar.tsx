"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/lib/permissionClient";
import { useMobileNav } from "@/components/layout/MobileNavProvider";
import {
  isGroup,
  sidebarMenuConfig,
  type SidebarMenuGroup,
  type SidebarMenuItem,
  type SidebarMenuLeaf
} from "@/components/layout/sidebar-menu-config";
import { SidebarGroupItem, SidebarLeafItem } from "@/components/layout/SidebarGroupItem";

function canAccessLeaf(
  leaf: SidebarMenuLeaf,
  permissionKeys: string[],
  isSystemAdmin: boolean
) {
  if (leaf.systemAdminOnly && !isSystemAdmin) return false;
  if (leaf.permission && !hasPermission(permissionKeys, leaf.permission)) return false;
  return true;
}

function matchesPath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function filterMenu(
  items: SidebarMenuItem[],
  permissionKeys: string[],
  isSystemAdmin: boolean
): SidebarMenuItem[] {
  const result: SidebarMenuItem[] = [];
  for (const item of items) {
    if (isGroup(item)) {
      const children = item.children.filter((c) =>
        canAccessLeaf(c, permissionKeys, isSystemAdmin)
      );
      if (children.length > 0) {
        result.push({ ...item, children });
      }
      continue;
    }
    if (canAccessLeaf(item, permissionKeys, isSystemAdmin)) {
      result.push(item);
    }
  }
  return result;
}

function collectAutoOpenGroupKeys(items: SidebarMenuItem[], pathname: string) {
  const keys = new Set<string>();
  for (const item of items) {
    if (isGroup(item) && item.children.some((c) => matchesPath(pathname, c.href))) {
      keys.add(item.key);
    }
  }
  return keys;
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { open, setOpen } = useMobileNav();
  const permissionKeys = (session?.permissionKeys as string[] | undefined) ?? [];
  const isSystemAdmin = Boolean((session as any)?.isSystemAdmin);

  const menu = useMemo(
    () => filterMenu(sidebarMenuConfig, permissionKeys, isSystemAdmin),
    [permissionKeys, isSystemAdmin]
  );

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const autoOpen = collectAutoOpenGroupKeys(menu, pathname);
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const key of autoOpen) next[key] = true;
      return next;
    });
  }, [menu, pathname]);

  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Menüyü kapat"
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside
        className={cn(
          "sticky top-0 flex h-screen w-72 flex-col border-r border-white/10 bg-[#090f1d]/85 text-slate-100 shadow-[0_0_120px_-60px_rgba(59,130,246,0.4)] backdrop-blur-2xl",
          "max-md:fixed max-md:z-50 max-md:transition-transform max-md:duration-300",
          open ? "max-md:translate-x-0" : "max-md:-translate-x-full"
        )}
      >
      <div className="flex items-center justify-between px-6 py-5">
        <div className="relative flex-1 overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-indigo-500/25 via-violet-500/15 to-cyan-400/15 px-4 py-3 shadow-[0_16px_40px_-22px_rgba(99,102,241,0.8)]">
          <div className="absolute -right-4 -top-4 h-14 w-14 rounded-full bg-white/20 blur-xl" />
          <div className="relative text-[11px] uppercase tracking-[0.2em] text-indigo-100/90">
            Maprithm
          </div>
          <div className="relative mt-1 text-sm font-semibold text-white">Ticaret AI OS</div>
          <div className="relative mt-1 text-[11px] text-slate-200/80">
            Premium Ticaret Çalışma Alanı
          </div>
        </div>
        <button
          type="button"
          aria-label="Menüyü kapat"
          className="ml-2 rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/10 md:hidden"
          onClick={() => setOpen(false)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {menu.map((item) => {
          if (!isGroup(item)) {
            return (
              <SidebarLeafItem
                key={item.key}
                item={item}
                active={matchesPath(pathname, item.href)}
              />
            );
          }

          const group = item as SidebarMenuGroup;
          const groupActive = group.children.some((c) => matchesPath(pathname, c.href));
          const isOpen = Boolean(openGroups[group.key]);

          return (
            <SidebarGroupItem
              key={group.key}
              label={group.label}
              icon={group.icon}
              active={groupActive}
              open={isOpen}
              onToggle={() =>
                setOpenGroups((prev) => ({ ...prev, [group.key]: !prev[group.key] }))
              }
            >
              {group.children.map((child) => (
                <SidebarLeafItem
                  key={child.key}
                  item={child}
                  nested
                  active={matchesPath(pathname, child.href)}
                />
              ))}
            </SidebarGroupItem>
          );
        })}
      </nav>

      <div className="px-4 pb-4">
        <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-3">
          <div className="text-xs text-slate-400">Sistem durumu</div>
          <div className="mt-1 flex items-center gap-2 text-xs text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Çevrimiçi
          </div>
        </div>
      </div>
    </aside>
    </>
  );
}
