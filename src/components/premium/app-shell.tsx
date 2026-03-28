import Link from "next/link";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

export function SidebarItem({
  href,
  label,
  icon: Icon,
  active
}: {
  href: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition",
        active
          ? "border-indigo-400/40 bg-indigo-500/15 text-white shadow-[0_0_0_1px_rgba(99,102,241,0.25)_inset]"
          : "border-transparent text-slate-300 hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
      )}
    >
      {Icon ? <Icon className="h-4 w-4 text-slate-400 group-hover:text-indigo-300" /> : null}
      <span className="truncate">{label}</span>
    </Link>
  );
}

