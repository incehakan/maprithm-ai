export default function AiProductsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          AI Ürün Oluştur
        </h1>
        <p className="text-sm text-slate-400">
          Burada yakında Türk e-ticaret pazarına özel yapay zeka destekli ürün
          oluşturma sihirbazı olacak.
        </p>
      </div>

      <div className="card max-w-xl text-sm text-slate-300">
        MVP kapsamında bu sayfa placeholder. Sonraki iterasyonlarda:
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-400">
          <li>Trend analizine göre ürün önerileri</li>
          <li>Otomatik başlık ve açıklama üretimi</li>
          <li>Fiyat optimizasyonu önerileri</li>
        </ul>
      </div>
    </div>
  );
}

