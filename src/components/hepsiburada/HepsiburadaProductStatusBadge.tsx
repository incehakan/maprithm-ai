"use client";

import {
  HB_PRODUCT_STATUS_LABELS_TR,
  type HbProductStatus,
} from "@/lib/hepsiburadaProductFormat";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  WAITING: "border-amber-400/40 bg-amber-400/10 text-amber-100",
  MISSING_INFO: "border-orange-400/40 bg-orange-400/10 text-orange-100",
  MATCHED: "border-emerald-400/40 bg-emerald-400/10 text-emerald-100",
  PRE_MATCHED: "border-sky-400/40 bg-sky-400/10 text-sky-100",
  REJECTED: "border-rose-400/40 bg-rose-400/10 text-rose-100",
  MATCHED_WITH_STAGED: "border-indigo-400/40 bg-indigo-400/10 text-indigo-100",
  CREATED: "border-slate-400/40 bg-slate-400/10 text-slate-200",
};

export function HepsiburadaProductStatusBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const key = (status ?? "").toUpperCase();
  const label =
    (HB_PRODUCT_STATUS_LABELS_TR as Record<string, string>)[key] ??
    (status?.trim() || "—");
  const tone = TONE[key] ?? "border-white/15 bg-white/[0.04] text-slate-200";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        tone,
        className
      )}
      title={key || undefined}
    >
      {label}
    </span>
  );
}

export function isHbProductStatus(v: string): v is HbProductStatus {
  return v in HB_PRODUCT_STATUS_LABELS_TR;
}
