"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveUserErrorMessage } from "@/lib/errors/resolveUserErrorMessage";

type ConnectionView = {
  id: string;
  platform: string;
  merchantId: string;
  apiKeyMasked: string;
  apiSecretMasked: string;
  serviceKeyMasked?: string | null;
  hasServiceKey?: boolean;
  userAgent: string;
  environment: string;
  isActive: boolean;
  lastTestAt: string | null;
};

function HepsiburadaSettingsPageContent() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connection, setConnection] = useState<ConnectionView | null>(null);

  const [merchantId, setMerchantId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [serviceKey, setServiceKey] = useState("");
  const [clearServiceKey, setClearServiceKey] = useState(false);
  const [userAgent, setUserAgent] = useState("");
  const [environment, setEnvironment] = useState<"test" | "production">(
    "production"
  );
  const [isActive, setIsActive] = useState(true);

  const [message, setMessage] = useState<{
    type: "success" | "error" | "warning";
    text: string;
  } | null>(null);

  const [syncingRefs, setSyncingRefs] = useState(false);
  const [refSyncResult, setRefSyncResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/integrations/hepsiburada/connection");
        const data = await res.json();
        if (data.connection) {
          setConnection(data.connection);
          setMerchantId(data.connection.merchantId || "");
          setUserAgent(data.connection.userAgent || "");
          setEnvironment(
            data.connection.environment === "test" ? "test" : "production"
          );
          setIsActive(data.connection.isActive !== false);
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
      const res = await fetch("/api/integrations/hepsiburada/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId,
          apiKey,
          apiSecret,
          serviceKey: clearServiceKey ? undefined : serviceKey,
          clearServiceKey: clearServiceKey || undefined,
          userAgent,
          environment,
          isActive
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          resolveUserErrorMessage(data, { fallback: "Kayıt başarısız." })
        );
      }
      if (data.connection) {
        setConnection(data.connection);
      }
      setApiKey("");
      setApiSecret("");
      setServiceKey("");
      setClearServiceKey(false);
      setMessage({ type: "success", text: "Hepsiburada bağlantı ayarları kaydedildi." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Kayıt sırasında hata oluştu."
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/hepsiburada/test-connection", {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          resolveUserErrorMessage(data, { fallback: "Test başarısız." })
        );
      }
      setMessage({
        type: data.success ? "success" : "error",
        text: data.success
          ? data.message || "Bağlantı testi başarılı."
          : data.error || "Bağlantı testi başarısız."
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

  async function handleSyncReferences() {
    setSyncingRefs(true);
    setRefSyncResult(null);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/hepsiburada/sync-references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncCategories: true })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          resolveUserErrorMessage(data, { fallback: "Referans senkronu başarısız." })
        );
      }
      setRefSyncResult(data.results ?? null);
      setMessage({ type: "success", text: "Referans senkronu tamamlandı." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Referans senkronu sırasında hata oluştu."
      });
    } finally {
      setSyncingRefs(false);
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
            Hepsiburada Entegrasyonu
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
        <Alert
          variant={
            message.type === "success"
              ? "success"
              : message.type === "warning"
                ? "warning"
                : "error"
          }
        >
          {message.text}
        </Alert>
      )}

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
          API Kimlik Bilgileri
        </h2>
        <p className="text-xs text-slate-400">
          Merchant ID, kullanıcı adı ve şifre Hepsiburada Partner (Merchant)
          Paneli &gt; Entegrasyon Bilgileri bölümünden alınır. Veritabanında{" "}
          <strong className="text-slate-300">şifrelenmiş</strong> saklanır.
        </p>

        {connection && (
          <div className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>
                Kayıtlı kullanıcı adı:{" "}
                <code className="text-slate-200">{connection.apiKeyMasked}</code>
              </span>
              <span>
                Kayıtlı şifre:{" "}
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
          <label className="label">Merchant ID</label>
          <Input
            type="text"
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
            placeholder="Örn: b2910839-83b9-4d45-adb6-86bad457edcb"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-slate-500">
            Her satıcının benzersiz kimliğidir (guid formatında). User-Agent
            header&apos;ında da otomatik kullanılır.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Kullanıcı adı (API Key)</label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                connection
                  ? "Değiştirmek için yeni değer girin"
                  : "Panelden kopyalayın"
              }
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label">Şifre (API Secret)</label>
            <Input
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder={
                connection
                  ? "Değiştirmek için yeni değer girin"
                  : "Panelden kopyalayın"
              }
              autoComplete="off"
            />
          </div>
        </div>

        <div>
          <label className="label">Servis Anahtarı (opsiyonel)</label>
          <Input
            type="password"
            value={serviceKey}
            onChange={(e) => {
              setServiceKey(e.target.value);
              if (e.target.value) setClearServiceKey(false);
            }}
            placeholder={
              connection?.hasServiceKey
                ? "Kayıtlı (maskeli). Değiştirmek için yeni değer girin"
                : "Panel Servis Anahtarı — rolü henüz teyit edilmedi"
            }
            autoComplete="off"
            disabled={clearServiceKey}
          />
          <p className="mt-1 text-xs text-slate-500">
            Store bazlı saklanır (şifreli). Basic Auth&apos;taki rolü doğrulanmadı;
            yalnızca <code className="text-slate-300">HB_USE_SERVICE_KEY_AS_PASSWORD=true</code>{" "}
            iken password yerine kullanılır. Env <code className="text-slate-300">HB_SERVICE_KEY</code>{" "}
            hâlâ fallback.
          </p>
          {connection?.hasServiceKey ? (
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={clearServiceKey}
                onChange={(e) => {
                  setClearServiceKey(e.target.checked);
                  if (e.target.checked) setServiceKey("");
                }}
                className="h-3.5 w-3.5 rounded border-slate-600"
              />
              Kayıtlı servis anahtarını sil
              {connection.serviceKeyMasked
                ? ` (şu an: ${connection.serviceKeyMasked})`
                : ""}
            </label>
          ) : null}
        </div>

        <div>
          <label className="label">User-Agent (opsiyonel özel değer)</label>
          <Input
            type="text"
            value={userAgent}
            onChange={(e) => setUserAgent(e.target.value)}
            placeholder='Boş bırakılırsa "{merchantId} - {HB_APP_NAME env}" otomatik kullanılır'
          />
          <p className="mt-1 text-xs text-amber-500/90">
            Hepsiburada, Trendyol&apos;dan farklı olarak eksik/yanlış User-Agent
            durumunda 401 döner. Format: &quot;merchantId - UygulamaAdı&quot;.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Ortam</label>
            <Select
              value={environment}
              onChange={(e) =>
                setEnvironment(e.target.value as "test" | "production")
              }
            >
              <option value="production">
                Production (oms-external.hepsiburada.com)
              </option>
              <option value="test">
                Test / SIT (oms-external-sit.hepsiburada.com)
              </option>
            </Select>
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
          Referans Verileri (Kategori / Marka / Özellik)
        </h2>
        <p className="text-xs text-slate-400">
          Hepsiburada kategori ağacını çekip <code className="text-slate-300">MarketplaceCategory</code>{" "}
          tablosuna yazar. Ürün eşleştirme ekranlarında bu veriler kullanılır.
        </p>
        <button
          type="button"
          onClick={handleSyncReferences}
          disabled={syncingRefs || !connection}
          className="btn-secondary disabled:opacity-50"
          title={!connection ? "Önce API bilgilerini kaydedin" : undefined}
        >
          {syncingRefs ? "Senkronize ediliyor…" : "Kategorileri senkronize et"}
        </button>
        {refSyncResult && (
          <pre className="max-h-64 overflow-auto rounded-lg border border-slate-700 bg-slate-950/80 p-3 text-[11px] text-slate-300">
            {JSON.stringify(refSyncResult, null, 2)}
          </pre>
        )}
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
          Sipariş Senkronu
        </h2>
        <ul className="list-disc space-y-1 pl-4 text-xs text-slate-400">
          <li>
            Manuel/anlık senkron: Siparişler sayfasındaki{" "}
            <strong className="text-slate-300">Hepsiburada — Senkron Et</strong> butonu.
          </li>
          <li>
            Otomatik arka plan cron:{" "}
            <code className="text-slate-300">
              GET /api/cron/hepsiburada-orders-background
            </code>{" "}
            (önerilen sıklık: 5 dakika)
          </li>
          <li>
            Webhook (opsiyonel, HB ile BaseURL kaydı yapıldıysa):{" "}
            <code className="text-slate-300">
              POST /api/webhooks/hepsiburada/orders
            </code>
          </li>
        </ul>
      </Card>
    </div>
  );
}

export default function HepsiburadaSettingsPage() {
  return (
    <ClientPagePermissionGuard permission="marketplace.integrations.manage">
      <HepsiburadaSettingsPageContent />
    </ClientPagePermissionGuard>
  );
}
