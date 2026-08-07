"use client";

import { useEffect, useState } from "react";
import {
  PageHeader,
  PanelSurface,
  PremiumButton,
  PremiumInput,
  PremiumSelect,
  SectionHeader,
  StatusBadge
} from "@/components/premium/design-system";
import { FieldLabel } from "@/components/ui/field-help";
import { extractApiErrorMessage } from "@/lib/apiErrorMessage";
import { cn } from "@/lib/utils";

type Conn = {
  id: string;
  sellerId: string;
  userAgent: string;
  environment: "stage" | "production";
  isActive: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
  apiKeyMasked: string;
  apiSecretMasked: string;
};

const HELP = {
  sellerId:
    "Trendyol Satıcı Paneli → (sağ üstte mağaza adınız) → Hesap Bilgilerim → Entegrasyon Bilgileri sayfasından alınır.",
  apiKey:
    "Trendyol Satıcı Paneli → (sağ üstte mağaza adınız) → Hesap Bilgilerim → Entegrasyon Bilgileri sayfasından alınır.",
  apiSecret:
    "Trendyol Satıcı Paneli → (sağ üstte mağaza adınız) → Hesap Bilgilerim → Entegrasyon Bilgileri sayfasından alınır.",
  userAgent:
    "Format: '<SatıcıID> - <FirmaAdı>', örn. '123456 - Maprithm'."
};

export default function AdminSystemConnectionsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connection, setConnection] = useState<Conn | null>(null);
  const [sellerId, setSellerId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [userAgent, setUserAgent] = useState("");
  const [environment, setEnvironment] = useState<"stage" | "production">(
    "production"
  );
  const [isActive, setIsActive] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">(
    "info"
  );
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/system-connections/trendyol");
      const data = await res.json();
      if (!res.ok) throw new Error(extractApiErrorMessage(data, "Yükleme hatası"));
      const conn = data.connection as Conn | null;
      setConnection(conn);
      if (conn) {
        setSellerId(conn.sellerId);
        setUserAgent(conn.userAgent);
        setEnvironment(conn.environment);
        setIsActive(conn.isActive);
      }
    } catch (e) {
      setMessageTone("error");
      setMessage(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/system-connections/trendyol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerId,
          apiKey,
          apiSecret,
          userAgent,
          environment,
          isActive
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(extractApiErrorMessage(data, "Kayıt hatası"));
      setApiKey("");
      setApiSecret("");
      setMessageTone("success");
      setMessage("Sistem bağlantısı kaydedildi.");
      await load();
    } catch (e) {
      setMessageTone("error");
      setMessage(e instanceof Error ? e.message : "Kayıt hatası");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/system-connections/trendyol/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerId,
          apiKey: apiKey || undefined,
          apiSecret: apiSecret || undefined,
          userAgent,
          environment
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, "Test başarısız."));
      }
      setTestResult({
        success: Boolean(data.success),
        message: data.message || (data.success ? "Bağlantı başarılı." : "Bağlantı başarısız.")
      });
    } catch (e) {
      setTestResult({
        success: false,
        message: e instanceof Error ? e.message : "Test sırasında hata oluştu."
      });
    } finally {
      setTesting(false);
    }
  }

  const messageClass =
    messageTone === "success"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : messageTone === "error"
        ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
        : "border-slate-700 bg-slate-900/50 text-slate-200";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sistem Bağlantıları"
        subtitle="Global referans veriyi besleyen platform bağlantılarını yönetin."
      />

      <PanelSurface className="space-y-6">
        <SectionHeader
          title="Trendyol Sistem Bağlantısı"
          subtitle="Bu bağlantı global referans veri senkronu için kullanılır. Mağaza bazlı değildir."
        />

        {message ? (
          <div className={cn("rounded-md border px-3 py-2 text-sm", messageClass)}>
            {message}
          </div>
        ) : null}

        {loading ? (
          <div className="text-sm text-slate-400">Yükleniyor…</div>
        ) : (
          <>
            {connection ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-slate-300">
                <div className="font-medium text-slate-200">Kayıtlı bilgiler</div>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  <div>API Key: {connection.apiKeyMasked}</div>
                  <div>API Secret: {connection.apiSecretMasked}</div>
                  <div>
                    Son senkron:{" "}
                    {connection.lastSyncAt
                      ? new Date(connection.lastSyncAt).toLocaleString("tr-TR")
                      : "—"}
                  </div>
                  <div>Son durum: {connection.lastSyncStatus ?? "—"}</div>
                </div>
              </div>
            ) : null}

            <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <h3 className="text-sm font-semibold text-slate-100">Bağlantı Bilgileri</h3>

              <div>
                <FieldLabel help={HELP.sellerId}>Satıcı ID</FieldLabel>
                <PremiumInput value={sellerId} onChange={(e) => setSellerId(e.target.value)} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <FieldLabel help={HELP.apiKey}>
                    API Key {connection ? "(güncellemek için doldurun)" : ""}
                  </FieldLabel>
                  <PremiumInput
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={connection ? "Değiştirmek için yazın" : ""}
                  />
                </div>
                <div>
                  <FieldLabel help={HELP.apiSecret}>
                    API Secret {connection ? "(güncellemek için doldurun)" : ""}
                  </FieldLabel>
                  <PremiumInput
                    type="password"
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    placeholder={connection ? "Değiştirmek için yazın" : ""}
                  />
                </div>
              </div>

              <div>
                <FieldLabel help={HELP.userAgent}>User-Agent</FieldLabel>
                <PremiumInput value={userAgent} onChange={(e) => setUserAgent(e.target.value)} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <FieldLabel help="Üretim ortamı canlı veri; Stage test ortamıdır.">
                    Ortam
                  </FieldLabel>
                  <PremiumSelect
                    value={environment}
                    onChange={(e) =>
                      setEnvironment(e.target.value as "stage" | "production")
                    }
                  >
                    <option value="production">Üretim (Production)</option>
                    <option value="stage">Stage (Test)</option>
                  </PremiumSelect>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                    />
                    Bağlantı aktif
                  </label>
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <h3 className="text-sm font-semibold text-slate-100">Bağlantı Testi</h3>
              <p className="text-xs text-slate-400">
                Kayıtlı veya formdaki bilgilerle Trendyol Partner API erişimini doğrular.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {connection?.isActive ? (
                  <StatusBadge variant="success">Aktif</StatusBadge>
                ) : (
                  <StatusBadge variant="warning">Pasif</StatusBadge>
                )}
                <PremiumButton onClick={testConnection} disabled={testing} variant="secondary">
                  {testing ? "Test ediliyor…" : "Bağlantıyı Test Et"}
                </PremiumButton>
                <PremiumButton onClick={save} disabled={saving}>
                  {saving ? "Kaydediliyor…" : "Kaydet"}
                </PremiumButton>
              </div>
              {testResult ? (
                <div
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm font-medium",
                    testResult.success
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                      : "border-rose-500/50 bg-rose-500/15 text-rose-200"
                  )}
                >
                  {testResult.success ? "Başarılı — " : "Başarısız — "}
                  {testResult.message}
                </div>
              ) : null}
            </section>
          </>
        )}
      </PanelSurface>
    </div>
  );
}
