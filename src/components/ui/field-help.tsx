"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function FieldHelp({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className={cn("relative inline-flex align-middle", className)}>
      <button
        type="button"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
        aria-label="Alan açıklaması"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        onBlur={() => setOpen(false)}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute left-0 top-6 z-50 w-72 rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-xs leading-relaxed text-slate-200 shadow-xl"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}

export function FieldLabel({
  htmlFor,
  children,
  help
}: {
  htmlFor?: string;
  children: React.ReactNode;
  help?: string;
}) {
  return (
    <label className="label mb-1 flex items-center gap-1" htmlFor={htmlFor}>
      <span>{children}</span>
      {help ? <FieldHelp text={help} /> : null}
    </label>
  );
}
