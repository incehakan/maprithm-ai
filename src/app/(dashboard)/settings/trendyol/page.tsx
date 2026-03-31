"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendyolWebhooksPanel } from "@/components/trendyol/TrendyolWebhooksPanel";

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
  cheSupplierId: string | null;
};

type AddressOption = { id: string; label: string };

function ProductProvidersSnippet() {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setText(null);
    try {
      const res = await fetch("/api/integrations/trendyol/product-providers");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setText(typeof data.error === "string" ? data.error : "Liste alınamadı.");
        return;
      }
      setText(JSON.stringify(data.data ?? data, null, 2));
    } catch {
      setText("İstek başarısız.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
        Ürün sağlayıcıları (Trendyol)
      </h2>
      <p className="text-xs text-slate-400">
        GET <code className="text-slate-300">/integration/product/sellers/&#123;id&#125;/providers</code>
      </p>
      <button
        type="button"
        onClick={load}
        disabled={loading}
        className="btn-secondary text-xs disabled:opacity-50"
      >
        {loading ? "Yükleniyor…" : "Sağlayıcı listesini çek"}
      </button>
      {text && (
        <pre className="max-h-64 overflow-auto rounded-lg border border-slate-700 bg-slate-950/80 p-3 text-[11px] text-slate-300">
          {text}
        </pre>
      )}
    </Card>
  );
}

type GlobalReferenceStatus = {
  isActive: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
  updatedAt: string;
};

function TrendyolSettingsPageContent() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connection, setConnection] = useState<ConnectionView | null>(null);
  const [globalStatus, setGlobalStatus] = useState<GlobalReferenceStatus | null>(null);

  const [addressOptions, setAddressOptions] = useState<AddressOption[]>([]);
  const [fetchingAddresses, setFetchingAddresses] = useState(false);
  const [shipmentAddressId, setShipmentAddressId] = useState("");
  const [returnAddressId, setReturnAddressId] = useState("");
  const [cheSupplierId, setCheSupplierId] = useState("");

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
        const [connRes, statusRes] = await Promise.all([
          fetch("/api/integrations/trendyol/connection"),
          fetch("/api/integrations/trendyol/reference-sync-status")
        ]);
        const connData = await connRes.json();
        const statusData = await statusRes.json();

        if (connData.connection) {
          setConnection(connData.connection);
          setSellerId(connData.connection.sellerId || "");
          setUserAgent(connData.connection.userAgent || "");
          setEnvironment(
            connData.connection.environment === "stage" ? "stage" : "production"
          );
          setIsActive(connData.connection.isActive !== false);
          setShipmentAddressId(
            connData.connection.shipmentAddressId?.trim() || ""
          );
          setReturnAddressId(connData.connection.returnAddressId?.trim() || "");
          setCheSupplierId(connData.connection.cheSupplierId?.trim() || "");
        }
        setGlobalStatus(statusData?.status ?? null);
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
          returnAddressId: returnAddressId.trim() || null,
          cheSupplierId: cheSupplierId.trim() || null
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
        setCheSupplierId(data.connection.cheSupplierId?.trim() || "");
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

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64 w-full" />
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

      {message && <Alert variant={message.type === "success" ? "success" : message.type === "warning" ? "warning" : "error"}>{message.text}</Alert>}

      <Card className="space-y-4">
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
          <Input
            type="text"
            value={sellerId}
            onChange={(e) => setSellerId(e.target.value)}
            placeholder="Örn: 123456"
            autoComplete="off"
          />
        </div>

        <div>
          <label className="label">CHE supplierId (Cari ekstre)</label>
          <Input
            type="text"
            value={cheSupplierId}
            onChange={(e) => setCheSupplierId(e.target.value)}
            placeholder="Boş bırakılırsa Seller ID kullanılır"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-slate-500">
            Trendyol finance/che uçları query parametresi. Seller ID’den farklıysa buraya girin.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">API Key</label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
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
            <Input
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
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
          <Input
            type="text"
            value={userAgent}
            onChange={(e) => setUserAgent(e.target.value)}
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
            <Select
              value={environment}
              onChange={(e) =>
                setEnvironment(e.target.value as "stage" | "production")
              }
            >
              <option value="production">Production (apigw.trendyol.com)</option>
              <option value="stage">Stage (stageapigw.trendyol.com)</option>
            </Select>
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
      </Card>

      <Card className="space-y-4">
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
            <Select
              value={shipmentAddressId}
              onChange={(e) => setShipmentAddressId(e.target.value)}
            >
              <option value="">Seçin…</option>
              {addressOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="label">İade adresi</label>
            <Select
              value={returnAddressId}
              onChange={(e) => setReturnAddressId(e.target.value)}
            >
              <option value="">Seçin…</option>
              {addressOptions.map((a) => (
                <option key={`r-${a.id}`} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Adresleri seçtikten sonra üstteki <strong>Kaydet</strong> ile
          saklayın; aksi halde yayın sırasında hata alırsınız.
        </p>
      </Card>

      <ProductProvidersSnippet />

      <TrendyolWebhooksPanel />

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
          Global Referans Veri Durumu
        </h2>
        <p className="text-xs text-slate-400">
          Trendyol marka/kategori/yaprak/özellik verileri artık mağazaya özel
          çekilmez. Sistem genelinde tek kopya tutulur ve otomatik cron ile
          güncellenir.
        </p>
        <ul className="list-disc space-y-1 pl-4 text-xs text-slate-400">
          <li>Markaları Çek / Kategorileri Çek / Yaprakları Çek / Özellikleri Çek kaldırıldı.</li>
          <li>Cron endpoint: <code className="text-slate-300">GET /api/cron/trendyol-reference-sync</code></li>
          <li>Ürün eşleştirme dropdownları global referans tablolarını kullanır.</li>
        </ul>
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs text-slate-300">
          {globalStatus ? (
            <>
              <div>
                Sistem bağlantısı:{" "}
                <strong className={globalStatus.isActive ? "text-emerald-400" : "text-amber-400"}>
                  {globalStatus.isActive ? "Aktif" : "Pasif"}
                </strong>
              </div>
              <div>
                Son global senkron:{" "}
                <strong>
                  {globalStatus.lastSyncAt
                    ? new Date(globalStatus.lastSyncAt).toLocaleString("tr-TR")
                    : "—"}
                </strong>
              </div>
              <div>
                Sonuç:{" "}
                <strong className="text-slate-200">{globalStatus.lastSyncStatus ?? "—"}</strong>
              </div>
              {globalStatus.lastSyncMessage && (
                <div className="mt-1 text-slate-400">{globalStatus.lastSyncMessage}</div>
              )}
            </>
          ) : (
            <div className="text-amber-300">
              SystemMarketplaceConnection bulunamadı. Global referans sync için sistem bağlantısı tanımlayın.
            </div>
          )}
        </div>
      </Card>
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
