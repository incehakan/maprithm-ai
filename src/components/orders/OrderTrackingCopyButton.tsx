"use client";

import { useCallback, useState } from "react";

type Props = {
  text: string;
  label?: string;
  className?: string;
};

export function OrderTrackingCopyButton({ text, label = "Kopyala", className }: Props) {
  const [done, setDone] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      window.setTimeout(() => setDone(false), 1600);
    } catch {
      setDone(false);
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={
        className ??
        "rounded-md border border-white/15 bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-white/[0.08]"
      }
    >
      {done ? "Kopyalandı" : label}
    </button>
  );
}
