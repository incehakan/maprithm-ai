"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SidebarMenuLeaf } from "@/components/layout/sidebar-menu-config";

type SidebarLeafProps = {
  item: SidebarMenuLeaf;
  active: boolean;
  nested?: boolean;
};

export function SidebarLeafItem({ item, active, nested = false }: SidebarLeafProps) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition duration-200",
        nested ? "ml-3 border-transparent py-2 text-[13px]" : "",
        active
          ? "border-indigo-300/45 bg-gradient-to-r from-indigo-500/25 via-violet-500/15 to-transparent text-white shadow-[0_0_0_1px_rgba(129,140,248,0.25)_inset]"
          : "border-transparent text-slate-300 hover:-translate-y-[1px] hover:border-indigo-300/25 hover:bg-gradient-to-r hover:from-indigo-500/15 hover:to-transparent hover:text-white"
      )}
    >
      {Icon ? <Icon className="h-4 w-4 text-slate-400 transition group-hover:text-indigo-300" /> : null}
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

type SidebarGroupProps = {
  label: string;
  icon: LucideIcon;
  open: boolean;
  active: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export function SidebarGroupItem({
  label,
  icon: Icon,
  open,
  active,
  onToggle,
  children
}: SidebarGroupProps) {
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "group flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition duration-200",
          active
            ? "border-indigo-300/35 bg-gradient-to-r from-indigo-500/18 via-violet-500/10 to-transparent text-white"
            : "border-transparent text-slate-300 hover:border-white/10 hover:bg-white/[0.03] hover:text-white"
        )}
      >
        <Icon className="h-4 w-4 text-slate-400 transition group-hover:text-indigo-300" />
        <span className="flex-1 truncate">{label}</span>
        <ChevronRight
          className={cn(
            "h-4 w-4 text-slate-400 transition-transform duration-200",
            open ? "rotate-90 text-indigo-300" : ""
          )}
        />
      </button>
      <div
        className={cn(
          "grid overflow-hidden transition-all duration-200 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="min-h-0 space-y-1 pl-2">{children}</div>
      </div>
    </div>
  );
}

