"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      router.push("/register-store");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt sırasında hata.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 text-sm text-slate-200">
        Bu projede kullanıcı kaydı mağaza merkezlidir. Lütfen önce mağaza oluşturun.
      </div>
      <div>
        <Link href="/register-store" className="btn-primary w-full text-center">
          Mağaza oluştur
        </Link>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <p className="mt-2 text-center text-xs text-slate-400">
        Zaten hesabın var mı?{" "}
        <Link href="/login" className="text-indigo-400 hover:underline">
          Giriş yap
        </Link>
      </p>
    </form>
  );
}

