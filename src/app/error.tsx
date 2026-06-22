"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0b0f19] px-4 text-center text-slate-100">
      <p className="text-sm font-medium uppercase tracking-widest text-rose-300">Hata</p>
      <h1 className="mt-2 text-2xl font-semibold">Bir şeyler ters gitti</h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        Beklenmeyen bir hata oluştu. Sayfayı yenilemeyi deneyin; sorun devam ederse
        destek ekibine başvurun.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          Tekrar dene
        </button>
        <Link href="/dashboard" className="btn-secondary">
          Panele dön
        </Link>
      </div>
    </div>
  );
}
