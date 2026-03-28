"use client";

import { signOut } from "next-auth/react";
import { LogOut, UserCircle2 } from "lucide-react";

export function UserMenu() {
  async function handleLogout() {
    await signOut({ callbackUrl: "/login" });
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-indigo-500/25 via-violet-500/20 to-blue-500/20 text-slate-200">
        <UserCircle2 className="h-4 w-4" />
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="inline-flex items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/[0.08]"
      >
        <LogOut className="h-3.5 w-3.5" />
        Çıkış yap
      </button>
    </div>
  );
}

