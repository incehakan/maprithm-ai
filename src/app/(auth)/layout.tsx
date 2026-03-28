export default function AuthLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b0f19] px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.18),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(168,85,247,0.18),transparent_35%),radial-gradient(circle_at_50%_100%,rgba(59,130,246,0.14),transparent_45%)]" />
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-7 shadow-[0_30px_120px_-50px_rgba(15,23,42,1)] backdrop-blur-xl">
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-[0.18em] text-indigo-200/80">Maprithm Commerce AI</div>
          <div className="mt-2 text-lg font-semibold text-white">Hesabınıza giriş yapın</div>
        </div>
        {children}
      </div>
    </div>
  );
}

