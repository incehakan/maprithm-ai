import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0b0f19] px-4 text-center text-slate-100">
      <p className="text-sm font-medium uppercase tracking-widest text-indigo-300">404</p>
      <h1 className="mt-2 text-2xl font-semibold">Sayfa bulunamadı</h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        Aradığınız adres mevcut değil veya taşınmış olabilir. Giriş için{" "}
        <code className="text-slate-300">/login</code> adresini kullanın.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/login" className="btn-primary">
          Giriş yap
        </Link>
        <Link href="/dashboard" className="btn-secondary">
          Panele git
        </Link>
      </div>
    </div>
  );
}
