"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { safeParseJsonResponse } from "@/lib/safeParseJsonResponse";
import { PremiumButton } from "@/components/premium/design-system";
import { Alert } from "@/components/ui/alert";

type SyncState = { loading: boolean; message: string | null; error: string | null };
const idle: SyncState = { loading: false, message: null, error: null };

export function ReturnsSyncButton() {
  const router = useRouter();
  const [ty, setTy] = useState<SyncState>(idle);
  const [hb, setHb] = useState<SyncState>(idle);

  async function syncTrendyol() {
    setTy({ loading: true, message: null, error: null });
    try {
      const res = await fetch("/api/returns/trendyol/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = await safeParseJsonResponse(res);
      if (!res.ok || !data || (data as { success?: boolean }).success !== true) {
        setTy({ loading: false, message: null, error: (data as { error?: string })?.error ?? "Senkron başarısız." });
        return;
      }
      const n = (data as { upserted?: number }).upserted ?? 0;
      setTy({ loading: false, message: `${n} kayıt güncellendi.`, error: null });
      router.refresh();
    } catch {
      setTy({ loading: false, message: null, error: "İstek başarısız." });
    }
  }

  async function syncHepsiburada() {
    setHb({ loading: true, message: null, error: null });
    try {
      const res = await fetch("/api/returns/hepsiburada/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = await safeParseJsonResponse(res);
      if (!res.ok || !data || (data as { success?: boolean }).success !== true) {
        setHb({ loading: false, message: null, error: (data as { error?: string })?.error ?? "Senkron başarısız." });
        return;
      }
      const r = data as { synced?: number; errors?: number };
      const msg = `${r.synced ?? 0} kayıt senkronlandı${(r.errors ?? 0) > 0 ? `, ${r.errors} hata` : ""}.`;
      setHb({ loading: false, message: msg, error: null });
      router.refresh();
    } catch {
      setHb({ loading: false, message: null, error: "İstek başarısız." });
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        <PremiumButton type="button" disabled={ty.loading} onClick={() => void syncTrendyol()}>
          {ty.loading ? "Senkron…" : "Trendyol iadeleri"}
        </PremiumButton>
        <PremiumButton type="button" disabled={hb.loading} onClick={() => void syncHepsiburada()}>
          {hb.loading ? "Senkron…" : "Hepsiburada iadeleri"}
        </PremiumButton>
      </div>
      {ty.message && <Alert variant="success" className="max-w-sm text-right text-xs">{ty.message}</Alert>}
      {ty.error   && <Alert variant="error"   className="max-w-sm text-right text-xs">{ty.error}</Alert>}
      {hb.message && <Alert variant="success" className="max-w-sm text-right text-xs">{hb.message}</Alert>}
      {hb.error   && <Alert variant="error"   className="max-w-sm text-right text-xs">{hb.error}</Alert>}
    </div>
  );
}
