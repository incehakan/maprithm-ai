"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";

type ConnectionView = {
  id: string;
  platform: string;
  sellerId: string;
  apiKeyMasked: string;
  apiSecretMasked: string;
  userAgent: string;
  environment: string;
  isActive: boolean;
  lastTestAt: string | null;
  shipmentAddressId: string | null;
  returnAddressId: string | null;
};

type AddressOption = { id: string; label: string };

function TrendyolSettingsPageContent() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncingBrands, setSyncingBrands] = useState(false);
  const [syncingCategories, setSyncingCategories] = useState(false);
  const [syncingCategoryAttrs, setSyncingCategoryAttrs] = useState(false);
  const [attrCategoryIdInput, setAttrCategoryIdInput] = useState("");
  const [lastAttrSync, setLastAttrSync] = useState<{
    attributeCount: number;
    valueCount: number;
    mode?: "single" | "allLeaf";
    categoriesProcessed?: number;
    categoriesFailed?: number;
  } | null>(null);
  const [connection, setConnection] = useState<ConnectionView | null>(null);

  const [addressOptions, setAddressOptions] = useState<AddressOption[]>([]);
  const [fetchingAddresses, setFetchingAddresses] = useState(false);
  const [shipmentAddressId, setShipmentAddressId] = useState("");
  const [returnAddressId, setReturnAddressId] = useState("");

  const [sellerId, setSellerId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [userAgent, setUserAgent] = useState("");
  const [environment, setEnvironment] = useState<"stage" | "production">(
    "production"
  );
  const [isActive, setIsActive] = useState(true);

  const [message, setMessage] = useState<{
    type: "success" | "error" | "warning";
    text: string;
  } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/integrations/trendyol/connection");
        const data = await res.json();
        if (data.connection) {
          setConnection(data.connection);
          setSellerId(data.connection.sellerId || "");
          setUserAgent(data.connection.userAgent || "");
          setEnvironment(
            data.connection.environment === "stage" ? "stage" : "production"
          );
          setIsActive(data.connection.isActive !== false);
          setShipmentAddressId(
            data.connection.shipmentAddressId?.trim() || ""
          );
          setReturnAddressId(data.connection.returnAddressId?.trim() || "");
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/trendyol/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerId,
          apiKey,
          apiSecret,
          userAgent,
          environment,
          isActive,
          shipmentAddressId: shipmentAddressId.trim() || null,
          returnAddressId: returnAddressId.trim() || null
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Kayıt başarısız.");
      }
      if (data.connection) {
        setConnection(data.connection);
        setShipmentAddressId(
          data.connection.shipmentAddressId?.trim() || ""
        );
        setReturnAddressId(data.connection.returnAddressId?.trim() || "");
      }
      setApiKey("");
      setApiSecret("");
      setMessage({ type: "success", text: "Trendyol bağlantı ayarları kaydedildi." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Kayıt sırasında hata oluştu."
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleFetchAddresses() {
    setFetchingAddresses(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/trendyol/addresses");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Adresler alınamadı.");
      }
      const list = (data.addresses as AddressOption[]) ?? [];
      setAddressOptions(
        list.map((a: { id: string; label: string }) => ({
          id: a.id,
          label: a.label
        }))
      );
      if (
        typeof data.defaultShipmentAddressId === "string" &&
        data.defaultShipmentAddressId &&
        !shipmentAddressId.trim()
      ) {
        setShipmentAddressId(data.defaultShipmentAddressId);
      }
      if (
        typeof data.defaultReturningAddressId === "string" &&
        data.defaultReturningAddressId &&
        !returnAddressId.trim()
      ) {
        setReturnAddressId(data.defaultReturningAddressId);
      }
      if (list.length === 0) {
        setMessage({
          type: "warning",
          text:
            (typeof data.emptyHint === "string" && data.emptyHint) ||
            "Trendyol adres listesi boş. Panelde adres tanımlı mı kontrol edin."
        });
      } else {
        setMessage({
          type: "success",
          text: `${list.length} adres listelendi. Gönderim ve iade için seçip Kaydet ile saklayın.`
        });
      }
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err instanceof Error ? err.message : "Adres listesi alınamadı."
      });
    } finally {
      setFetchingAddresses(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/trendyol/test-connection", {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || data?.message || "Test başarısız.");
      }
      if (data.lastTestAt) {
        setConnection((prev) =>
          prev
            ? { ...prev, lastTestAt: data.lastTestAt }
            : prev
        );
      }
      setMessage({
        type: data.success ? "success" : "error",
        text: data.success
          ? data.message || "Bağlantı testi başarılı."
          : data.message || "Bağlantı testi başarısız."
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Test sırasında hata oluştu."
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSyncBrands() {
    setSyncingBrands(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/trendyol/sync-brands", {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Markalar çekilemedi.");
      }
      setMessage({
        type: "success",
        text: data.message || `${data.count ?? 0} marka senkronize edildi.`
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Markalar çekilirken hata oluştu."
      });
    } finally {
      setSyncingBrands(false);
    }
  }

  async function handleSyncCategories() {
    setSyncingCategories(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/trendyol/sync-categories", {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Kategoriler çekilemedi.");
      }
      setMessage({
        type: "success",
        text: data.message || `${data.count ?? 0} kategori senkronize edildi.`
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Kategoriler çekilirken hata oluştu."
      });
    } finally {
      setSyncingCategories(false);
    }
  }

  async function handleSyncCategoryAttributes() {
    const parsed = parseInt(attrCategoryIdInput.trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setMessage({
        type: "error",
        text: "Geçerli bir kategori ID girin (pozitif tam sayı)."
      });
      return;
    }

    setSyncingCategoryAttrs(true);
    setMessage(null);
    setLastAttrSync(null);
    try {
      const res = await fetch(
        "/api/integrations/trendyol/sync-category-attributes",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId: parsed })
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Kategori özellikleri çekilemedi.");
      }
      setLastAttrSync({
        attributeCount: data.attributeCount ?? 0,
        valueCount: data.valueCount ?? 0,
        mode: data.mode === "allLeaf" ? "allLeaf" : "single",
        categoriesProcessed: data.categoriesProcessed,
        categoriesFailed: data.categoriesFailed
      });
      setMessage({
        type: "success",
        text:
          data.message ||
          `${data.attributeCount ?? 0} özellik, ${data.valueCount ?? 0} değer senkronize edildi.`
      });
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Kategori özellikleri çekilirken hata oluştu."
      });
    } finally {
      setSyncingCategoryAttrs(false);
    }
  }

  async function handleSyncAllLeafCategoryAttributes() {
    const ok = window.confirm(
      "Veritabanındaki tüm yaprak kategoriler için Trendyol API çağrılacak. Kategori sayısı fazlaysa işlem uzun sürebilir ve rate limit riski vardır. Devam edilsin mi?"
    );
    if (!ok) return;

    setSyncingCategoryAttrs(true);
    setMessage(null);
    setLastAttrSync(null);
    try {
      const res = await fetch(
        "/api/integrations/trendyol/sync-category-attributes",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ syncAllLeafCategories: true })
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Toplu özellik senkronu başarısız.");
      }
      setLastAttrSync({
        attributeCount: data.attributeCount ?? 0,
        valueCount: data.valueCount ?? 0,
        mode: "allLeaf",
        categoriesProcessed: data.categoriesProcessed,
        categoriesFailed: data.categoriesFailed
      });
      setMessage({
        type: "success",
        text: data.message || "Toplu kategori özellikleri senkronize edildi."
      });
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Toplu senkron sırasında hata oluştu."
      });
    } finally {
      setSyncingCategoryAttrs(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">
          Trendyol Entegrasyonu
        </h1>
        <p className="text-sm text-slate-400">Yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Trendyol Entegrasyonu
          </h1>
          <p className="text-sm text-slate-400">
            Partner API bilgilerinizi güvenli şekilde kaydedin ve bağlantıyı test
            edin.
          </p>
        </div>
        <Link
          href="/settings"
          className="text-sm text-indigo-400 hover:underline"
        >
          ← Genel ayarlara dön
        </Link>
      </div>

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-emerald-800 bg-emerald-900/30 text-emerald-200"
              : message.type === "warning"
                ? "border-amber-700 bg-amber-900/25 text-amber-100"
                : "border-red-800 bg-red-900/30 text-red-200"
          }`}
          role="alert"
        >
          {message.text}
        </div>
      )}

      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
          API Kimlik Bilgileri
        </h2>
        <p className="text-xs text-slate-400">
          API Key ve Secret Trendyol satıcı paneli &gt; Hesap Bilgilerim &gt;
          Entegrasyon Bilgileri bölümünden alınır. Veritabanında{" "}
          <strong className="text-slate-300">şifrelenmiş</strong> saklanır.
        </p>

        {connection && (
          <div className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>
                Kayıtlı API Key:{" "}
                <code className="text-slate-200">{connection.apiKeyMasked}</code>
              </span>
              <span>
                Kayıtlı API Secret:{" "}
                <code className="text-slate-200">
                  {connection.apiSecretMasked}
                </code>
              </span>
            </div>
            {connection.lastTestAt && (
              <p className="mt-2 text-slate-500">
                Son test:{" "}
                {new Date(connection.lastTestAt).toLocaleString("tr-TR")}
              </p>
            )}
          </div>
        )}

        <div>
          <label className="label">Seller ID</label>
          <input
            type="text"
            value={sellerId}
            onChange={(e) => setSellerId(e.target.value)}
            className="input"
            placeholder="Örn: 123456"
            autoComplete="off"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="input"
              placeholder={
                connection
                  ? "Değiştirmek için yeni key girin"
                  : "Panelden kopyalayın"
              }
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label">API Secret</label>
            <input
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              className="input"
              placeholder={
                connection
                  ? "Değiştirmek için yeni secret girin"
                  : "Panelden kopyalayın"
              }
              autoComplete="off"
            />
          </div>
        </div>

        <div>
          <label className="label">User-Agent</label>
          <input
            type="text"
            value={userAgent}
            onChange={(e) => setUserAgent(e.target.value)}
            className="input"
            placeholder='Örn: "123456 - SelfIntegration" veya "123456 - FirmaAdi"'
          />
          <p className="mt-1 text-xs text-slate-500">
            Trendyol dokümantasyonuna göre zorunludur; Seller ID ve entegratör adı
            içermelidir.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Ortam</label>
            <select
              value={environment}
              onChange={(e) =>
                setEnvironment(e.target.value as "stage" | "production")
              }
              className="input"
            >
              <option value="production">Production (apigw.trendyol.com)</option>
              <option value="stage">Stage (stageapigw.trendyol.com)</option>
            </select>
            <p className="mt-1 text-xs text-amber-500/90">
              Stage ortamı için IP yetkilendirmesi gerekebilir; aksi halde 503
              alabilirsiniz.
            </p>
          </div>
          <div className="flex items-end pb-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600"
              />
              Bağlantı aktif
            </label>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 border-t border-slate-700 pt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !connection}
            className="btn-secondary disabled:opacity-50"
            title={
              !connection
                ? "Önce ayarları kaydedin"
                : "Kayıtlı kimlik bilgileriyle test isteği gönder"
            }
          >
            {testing ? "Test ediliyor..." : "Bağlantıyı Test Et"}
          </button>
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
          Gönderim ve iade adresleri
        </h2>
        <p className="text-xs text-slate-400">
          Ürün yayınlarken Trendyol&apos;a gönderim ve iade adresi ID&apos;leri
          gerekir. Önce &quot;Adresleri getir&quot; ile listeyi çekin, sonra
          seçip <strong>Kaydet</strong> ile bağlantıya yazın.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleFetchAddresses}
            disabled={fetchingAddresses || !connection}
            className="btn-secondary disabled:opacity-50"
            title={
              !connection
                ? "Önce API bilgilerini kaydedin"
                : "Trendyol adres listesini çek"
            }
          >
            {fetchingAddresses ? "Yükleniyor..." : "Adresleri getir"}
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Gönderim adresi</label>
            <select
              value={shipmentAddressId}
              onChange={(e) => setShipmentAddressId(e.target.value)}
              className="input"
            >
              <option value="">Seçin…</option>
              {addressOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">İade adresi</label>
            <select
              value={returnAddressId}
              onChange={(e) => setReturnAddressId(e.target.value)}
              className="input"
            >
              <option value="">Seçin…</option>
              {addressOptions.map((a) => (
                <option key={`r-${a.id}`} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Adresleri seçtikten sonra üstteki <strong>Kaydet</strong> ile
          saklayın; aksi halde yayın sırasında hata alırsınız.
        </p>
      </div>

      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
          Marka ve Kategori Senkronizasyonu
        </h2>
        <p className="text-xs text-slate-400">
          Trendyol API&apos;den marka ve kategori listesini çekip veritabanına
          kaydedin. Ürün oluştururken bu veriler kullanılabilir. API&apos;de
          pasif olarak işaretlenen kayıtlar <code className="text-slate-300">isActive=false</code>{" "}
          ile saklanır; liste ve dropdown sorgularında varsayılan olarak sadece{" "}
          <code className="text-slate-300">isActive</code> değeri{" "}
          <code className="text-slate-300">true</code> veya{" "}
          <code className="text-slate-300">null</code> olanlar kullanılmalıdır (
          <code className="text-xs text-indigo-300">trendyolBrandListableWhere</code> /{" "}
          <code className="text-xs text-indigo-300">trendyolCategoryListableWhere</code>
          ).
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleSyncBrands}
            disabled={syncingBrands || !connection}
            className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              !connection
                ? "Önce bağlantı ayarlarını kaydedin"
                : "Trendyol'dan marka listesini çek"
            }
          >
            {syncingBrands ? "Çekiliyor..." : "Markaları Çek"}
          </button>
          <button
            type="button"
            onClick={handleSyncCategories}
            disabled={syncingCategories || !connection}
            className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              !connection
                ? "Önce bağlantı ayarlarını kaydedin"
                : "Trendyol'dan kategori listesini çek"
            }
          >
            {syncingCategories ? "Çekiliyor..." : "Kategorileri Çek"}
          </button>
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
          Kategori özellikleri (attributes)
        </h2>
        <p className="text-xs text-slate-400">
          Trendyol API&apos;de tüm kategorilerin özelliklerini tek istekte veren bir
          uç yok; her yaprak kategori için ayrı URL çağrılır. İsterseniz tek{" "}
          <code className="text-slate-300">categoryId</code> girerek deneyebilir
          veya önce{" "}
          <strong className="text-slate-300">Kategorileri Çek</strong> sonrası
          veritabanındaki tüm yapraklar için toplu senkron başlatabilirsiniz.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="label">Kategori ID (tek kategori)</label>
            <input
              type="number"
              min={1}
              step={1}
              value={attrCategoryIdInput}
              onChange={(e) => setAttrCategoryIdInput(e.target.value)}
              className="input"
              placeholder="Örn: 411"
              disabled={!connection}
            />
          </div>
          <button
            type="button"
            onClick={handleSyncCategoryAttributes}
            disabled={syncingCategoryAttrs || !connection}
            className="btn-secondary shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              !connection
                ? "Önce bağlantı ayarlarını kaydedin"
                : "Seçilen kategori için özellik listesini çek"
            }
          >
            {syncingCategoryAttrs ? "Çekiliyor..." : "Kategori Özelliklerini Çek"}
          </button>
        </div>
        <div className="border-t border-slate-700 pt-3">
          <button
            type="button"
            onClick={handleSyncAllLeafCategoryAttributes}
            disabled={syncingCategoryAttrs || !connection}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            title="DB'deki yaprak kategoriler için sırayla API çağrısı (uzun sürebilir)"
          >
            {syncingCategoryAttrs
              ? "İşleniyor..."
              : "Tüm yaprak kategoriler için özellikleri çek"}
          </button>
          <p className="mt-2 text-xs text-amber-500/90">
            Çok sayıda yaprak kategori varsa işlem dakikalar sürebilir. İstekler
            arasında kısa gecikme vardır (rate limit).
          </p>
        </div>
        {lastAttrSync !== null && (
          <div className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs text-slate-300">
            <span className="text-slate-400">Son senkron: </span>
            {lastAttrSync.mode === "allLeaf" &&
              lastAttrSync.categoriesProcessed != null && (
                <>
                  <strong>{lastAttrSync.categoriesProcessed}</strong> yaprak kategori
                  işlendi
                  {lastAttrSync.categoriesFailed != null &&
                    lastAttrSync.categoriesFailed > 0 && (
                      <>
                        {" "}
                        (<span className="text-amber-400">
                          {lastAttrSync.categoriesFailed} hata
                        </span>
                        )
                      </>
                    )}
                  ,{" "}
                </>
              )}
            <strong>{lastAttrSync.attributeCount}</strong> özellik,{" "}
            <strong>{lastAttrSync.valueCount}</strong> değer
          </div>
        )}
      </div>
    </div>
  );
}

export default function TrendyolSettingsPage() {
  return (
    <ClientPagePermissionGuard permission="marketplace.integrations.manage">
      <TrendyolSettingsPageContent />
    </ClientPagePermissionGuard>
  );
}
