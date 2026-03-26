"use client";

import { signOut } from "next-auth/react";

export function UserMenu() {
  async function handleLogout() {
    await signOut({ callbackUrl: "/login" });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleLogout}
        className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
      >
        Çıkış yap
      </button>
    </div>
  );
}

