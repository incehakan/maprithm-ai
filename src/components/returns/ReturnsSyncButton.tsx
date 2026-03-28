"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { safeParseJsonResponse } from "@/lib/safeParseJsonResponse";
import { PremiumButton } from "@/components/premium/design-system";
import { Alert } from "@/components/ui/alert";

export function ReturnsSyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/returns/trendyol/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = await safeParseJsonResponse(res);
      if (!res.ok || !data || (data as { success?: boolean }).success !== true) {
        setError((data as { error?: string })?.error ?? "Senkron başarısız.");
        setLoading(false);
        return;
      }
      const n = (data as { upserted?: number }).upserted ?? 0;
      setMessage(`${n} kayıt güncellendi.`);
      router.refresh();
    } catch {
      setError("İstek başarısız.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <PremiumButton type="button" disabled={loading} onClick={() => void sync()}>
        {loading ? "Senkron…" : "Trendyol iadeleri senkronla"}
      </PremiumButton>
      {message && (
        <Alert variant="success" className="max-w-sm text-right text-xs">
          {message}
        </Alert>
      )}
      {error && (
        <Alert variant="error" className="max-w-sm text-right text-xs">
          {error}
        </Alert>
      )}
    </div>
  );
}
