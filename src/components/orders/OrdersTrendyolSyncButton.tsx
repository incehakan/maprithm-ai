"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { safeParseJsonResponse } from "@/lib/safeParseJsonResponse";

type Props = {
  statusFilter?: string;
};

export function OrdersTrendyolSyncButton({ statusFilter }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/orders/trendyol/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: statusFilter?.trim() || undefined
        })
      });
      const data = await safeParseJsonResponse(res);
      if (!res.ok || !data || (data as { success?: boolean }).success !== true) {
        setError((data as { error?: string })?.error ?? "Senkron başarısız.");
        return;
      }
      const upserted = (data as { upsertedPackages?: number }).upsertedPackages ?? 0;
      setMessage(`Senkron tamam. Güncellenen paket: ${upserted}.`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn-primary"
        disabled={loading}
        onClick={() => void sync()}
      >
        {loading ? "Senkronize ediliyor..." : "Trendyol — Senkron Et"}
      </button>
      {message && <span className="text-xs text-emerald-400">{message}</span>}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
