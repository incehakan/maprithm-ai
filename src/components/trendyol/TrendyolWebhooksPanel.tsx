"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TRENDYOL_WEBHOOK_STATUSES } from "@/lib/trendyolWebhooks";

type WebhookRow = {
  id?: string;
  url?: string;
  status?: string;
  authenticationType?: string;
  subscribedStatuses?: string[] | null;
  username?: string;
  createdDate?: number;
  lastModifiedDate?: number | null;
};

export function TrendyolWebhooksPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<WebhookRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [url, setUrl] = useState("");
  const [authType, setAuthType] = useState<"API_KEY" | "BASIC_AUTHENTICATION">("API_KEY");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [statusCsv, setStatusCsv] = useState("CREATED,PICKING,INVOICED,SHIPPED");

  const [editId, setEditId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editAuthType, setEditAuthType] = useState<"API_KEY" | "BASIC_AUTHENTICATION">("API_KEY");
  const [editUser, setEditUser] = useState("");
  const [editPass, setEditPass] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [editStatusCsv, setEditStatusCsv] = useState("");

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/trendyol/webhooks");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Liste alınamadı.");
      }
      const arr = Array.isArray(data.data) ? (data.data as WebhookRow[]) : [];
      setItems(arr);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function parseStatuses(csv: string): string[] | null {
    const parts = csv
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (parts.length === 0) return null;
    const allowed = new Set(TRENDYOL_WEBHOOK_STATUSES as unknown as string[]);
    const filtered = parts.filter((p) => allowed.has(p));
    return filtered.length ? filtered : null;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        url: url.trim(),
        authenticationType: authType
      };
      if (authType === "BASIC_AUTHENTICATION") {
        body.username = username.trim();
        body.password = password;
      } else {
        body.apiKey = apiKey.trim();
      }
      const st = parseStatuses(statusCsv);
      if (st) body.subscribedStatuses = st;

      const res = await fetch("/api/integrations/trendyol/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Oluşturulamadı");
      setUrl("");
      setPassword("");
      setApiKey("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hata");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu webhook silinsin mi?")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/integrations/trendyol/webhooks/${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Silinemedi");
      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hata");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        url: editUrl.trim(),
        authenticationType: editAuthType
      };
      if (editAuthType === "BASIC_AUTHENTICATION") {
        body.username = editUser.trim();
        body.password = editPass;
      } else {
        body.apiKey = editApiKey.trim();
      }
      const st = parseStatuses(editStatusCsv);
      body.subscribedStatuses = st;

      const res = await fetch(
        `/api/integrations/trendyol/webhooks/${encodeURIComponent(editId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Güncellenemedi");
      setEditId(null);
      setEditPass("");
      setEditApiKey("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hata");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: WebhookRow) {
    const id = row.id;
    if (!id) return;
    setEditId(id);
    setEditUrl(row.url ?? "");
    setEditAuthType(
      row.authenticationType === "BASIC_AUTHENTICATION"
        ? "BASIC_AUTHENTICATION"
        : "API_KEY"
    );
    setEditUser(row.username ?? "");
    setEditPass("");
    setEditApiKey("");
    setEditStatusCsv((row.subscribedStatuses ?? []).join(","));
  }

  return (
    <Card className="space-y-4">
      <h2 className="border-b border-slate-700 pb-2 text-sm font-semibold text-slate-100">
        Sipariş webhook&apos;ları
      </h2>
      <p className="text-xs text-slate-400">
        Trendyol Partner API: listeleyin, oluşturun, güncelleyin veya silin. URL kuralları
        dokümantasyona uyar (localhost ve &quot;trendyol&quot; içermemeli). Gelen POST ile
        sipariş gövdesi mevcut{" "}
        <code className="text-slate-300">/api/webhooks/trendyol/orders</code> uç noktanıza
        işlenebilir.
      </p>
      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/50 px-3 py-2 text-sm text-red-100">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          className="btn-secondary text-sm"
          disabled={loading || saving}
          onClick={() => void load()}
        >
          Yenile
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Yükleniyor…</p>
      ) : (
        <div className="max-h-64 space-y-2 overflow-auto text-xs">
          {items.length === 0 ? (
            <p className="text-slate-500">Kayıtlı webhook yok.</p>
          ) : (
            items.map((w) => (
              <div
                key={w.id}
                className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 text-slate-300"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-slate-500">{w.id}</span>
                  <span
                    className={
                      w.status === "ACTIVE"
                        ? "text-emerald-400"
                        : w.status === "PASSIVE"
                          ? "text-amber-300"
                          : "text-slate-400"
                    }
                  >
                    {w.status ?? "—"}
                  </span>
                </div>
                <div className="mt-1 break-all text-slate-200">{w.url}</div>
                <div className="mt-1 text-slate-500">
                  Auth: {w.authenticationType} · Abonelik:{" "}
                  {w.subscribedStatuses?.length
                    ? w.subscribedStatuses.join(", ")
                    : "(tüm statüler)"}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    disabled={saving}
                    onClick={() => startEdit(w)}
                  >
                    Düzenle
                  </button>
                  <button
                    type="button"
                    className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-200 hover:bg-red-950/40"
                    disabled={saving}
                    onClick={() => w.id && void handleDelete(w.id)}
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {editId && (
        <form onSubmit={handleUpdate} className="space-y-3 border-t border-slate-700 pt-4">
          <div className="text-xs font-semibold text-slate-200">Webhook düzenle: {editId}</div>
          <Input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} placeholder="https://..." />
          <Select
            value={editAuthType}
            onChange={(e) =>
              setEditAuthType(
                e.target.value === "BASIC_AUTHENTICATION"
                  ? "BASIC_AUTHENTICATION"
                  : "API_KEY"
              )
            }
          >
            <option value="API_KEY">API_KEY (x-api-key)</option>
            <option value="BASIC_AUTHENTICATION">BASIC_AUTHENTICATION</option>
          </Select>
          {editAuthType === "BASIC_AUTHENTICATION" ? (
            <>
              <Input value={editUser} onChange={(e) => setEditUser(e.target.value)} placeholder="Username" />
              <Input
                type="password"
                value={editPass}
                onChange={(e) => setEditPass(e.target.value)}
                placeholder="Yeni şifre"
              />
            </>
          ) : (
            <Input
              type="password"
              value={editApiKey}
              onChange={(e) => setEditApiKey(e.target.value)}
              placeholder="Yeni API key"
            />
          )}
          <Input
            value={editStatusCsv}
            onChange={(e) => setEditStatusCsv(e.target.value)}
            placeholder="CREATED,PICKING (boş = tümü)"
          />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={saving}>
              Kaydet
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEditId(null)}>
              İptal
            </button>
          </div>
        </form>
      )}

      <form onSubmit={handleCreate} className="space-y-3 border-t border-slate-700 pt-4">
        <div className="text-xs font-semibold text-slate-200">Yeni webhook</div>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://sizin-domain.com/api/webhooks/trendyol/orders" required />
        <Select
          value={authType}
          onChange={(e) =>
            setAuthType(
              e.target.value === "BASIC_AUTHENTICATION"
                ? "BASIC_AUTHENTICATION"
                : "API_KEY"
            )
          }
        >
          <option value="API_KEY">API_KEY</option>
          <option value="BASIC_AUTHENTICATION">BASIC_AUTHENTICATION</option>
        </Select>
        {authType === "BASIC_AUTHENTICATION" ? (
          <>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
            />
          </>
        ) : (
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Trendyol&apos;un göndereceği x-api-key değeri"
          />
        )}
        <Input
          value={statusCsv}
          onChange={(e) => setStatusCsv(e.target.value)}
          placeholder="Opsiyonel: CREATED,PICKING,... (boş gönderilirse Trendyol tüm statüleri bağlar)"
        />
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "…" : "Webhook oluştur"}
        </button>
      </form>
    </Card>
  );
}
