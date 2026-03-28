"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

export function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative z-10 w-full max-w-lg rounded-2xl border border-white/10 bg-[#0f1524]/90 p-5 shadow-2xl backdrop-blur-xl"
        )}
      >
        {title && <h3 className="mb-3 text-base font-semibold text-slate-100">{title}</h3>}
        {children}
      </div>
    </div>
  );
}

