"use client";

import { Bell, Menu, Search } from "lucide-react";
import { UserMenu } from "@/components/layout/UserMenu";
import { useMobileNav } from "@/components/layout/MobileNavProvider";

export function Topbar() {
  const { toggle } = useMobileNav();

  return (
    <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-gradient-to-r from-white/[0.05] via-white/[0.03] to-white/[0.02] px-3 py-3 shadow-[0_16px_60px_-34px_rgba(56,189,248,0.5)] backdrop-blur-xl sm:gap-4 sm:px-4">
      <button
        type="button"
        aria-label="Menüyü aç"
        className="rounded-xl border border-white/10 bg-white/[0.03] p-2 text-slate-300 transition hover:bg-white/[0.08] hover:text-white md:hidden"
        onClick={toggle}
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="relative min-w-0 flex-1 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          className="w-full rounded-xl border border-white/10 bg-[#0e1527]/90 py-2.5 pl-10 pr-3 text-sm text-slate-100 placeholder:text-slate-500 transition focus:border-indigo-300/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          placeholder="Ürün, sipariş veya SKU ara..."
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="relative rounded-xl border border-white/10 bg-white/[0.03] p-2 text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-violet-400" />
        </button>
        <UserMenu />
      </div>
    </div>
  );
}

