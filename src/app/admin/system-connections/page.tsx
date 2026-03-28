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

export default function AdminSystemConnectionsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/system-connections/trendyol");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Yükleme hatası");
      const conn = data.connection as Conn | null;
      setConnection(conn);
      if (conn) {
        setSellerId(conn.sellerId);
        setUserAgent(conn.userAgent);
        setEnvironment(conn.environment);
        setIsActive(conn.isActive);
      }
    } catch (e) {
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
      if (!res.ok) throw new Error(data?.error || "Kayıt hatası");
      setApiKey("");
      setApiSecret("");
      setMessage("Sistem bağlantısı kaydedildi.");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Kayıt hatası");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="System Connections"
        subtitle="Global referans veriyi besleyen platform bağlantılarını yönetin."
      />
      <PanelSurface className="space-y-4">
      <SectionHeader title="Trendyol Sistem Bağlantısı" />
      <p className="text-sm text-slate-400">
        Bu bağlantı global referans veri senkronu için kullanılır. Store bazlı değildir.
      </p>
      {message && (
        <div className="rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm">
          {message}
        </div>
      )}
      {loading ? (
        <div className="text-sm text-slate-400">Yükleniyor...</div>
      ) : (
        <>
          {connection && (
            <div className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs text-slate-300">
              <div>Kayıtlı API Key: {connection.apiKeyMasked}</div>
              <div>Kayıtlı API Secret: {connection.apiSecretMasked}</div>
              <div>
                Son sync:{" "}
                {connection.lastSyncAt
                  ? new Date(connection.lastSyncAt).toLocaleString("tr-TR")
                  : "—"}
              </div>
              <div>Son durum: {connection.lastSyncStatus ?? "—"}</div>
            </div>
          )}
          <div>
            <label className="label">Seller ID</label>
            <PremiumInput value={sellerId} onChange={(e) => setSellerId(e.target.value)} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">API Key (opsiyonel güncelle)</label>
              <PremiumInput
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
            <div>
              <label className="label">API Secret (opsiyonel güncelle)</label>
              <PremiumInput
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">User Agent</label>
            <PremiumInput value={userAgent} onChange={(e) => setUserAgent(e.target.value)} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Environment</label>
              <PremiumSelect
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as "stage" | "production")}
              >
                <option value="production">production</option>
                <option value="stage">stage</option>
              </PremiumSelect>
            </div>
            <label className="mt-8 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Bağlantı aktif
            </label>
          </div>
          <div className="flex items-center gap-2">
            {connection?.isActive ? <StatusBadge variant="success">Aktif</StatusBadge> : <StatusBadge variant="warning">Pasif</StatusBadge>}
            <PremiumButton onClick={save} disabled={saving}>
            {saving ? "Kaydediliyor..." : "Kaydet"}
            </PremiumButton>
          </div>
        </>
      )}
      </PanelSurface>
    </div>
  );
}

