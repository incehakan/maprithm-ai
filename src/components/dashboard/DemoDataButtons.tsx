"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type DemoDataButtonsProps = {
  hasDemoProducts: boolean;
  demoProductCount: number;
};

export function DemoDataButtons({ hasDemoProducts, demoProductCount }: DemoDataButtonsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleLoadDemo = async () => {
    if (hasDemoProducts) {
      setMessage({
        type: "error",
        text: `Zaten ${demoProductCount} adet demo ürününüz var. Önce mevcut demo verileri temizleyin.`
      });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/demo/load", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Demo verileri yüklenemedi");
      }

      setMessage({ type: "success", text: data.message });
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Bir hata oluştu"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClearDemo = async () => {
    if (!hasDemoProducts) {
      setMessage({ type: "error", text: "Silinecek demo ürünü bulunamadı" });
      return;
    }

    const confirmed = window.confirm(
      `${demoProductCount} adet demo ürünü silinecek. Devam etmek istiyor musunuz?`
    );

    if (!confirmed) return;

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/demo/clear", { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Demo verileri silinemedi");
      }

      setMessage({ type: "success", text: data.message });
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Bir hata oluştu"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleLoadDemo}
          disabled={loading || hasDemoProducts}
          className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <svg
              className="h-4 w-4 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
          )}
          Demo Veri Yükle
        </button>

        {hasDemoProducts && (
          <button
            onClick={handleClearDemo}
            disabled={loading}
            className="btn-secondary flex items-center gap-2 text-red-400 hover:text-red-300 border-red-500/30 hover:border-red-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <svg
                className="h-4 w-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            )}
            Demo Temizle ({demoProductCount})
          </button>
        )}
      </div>

      {message && (
        <div
          className={`rounded-lg px-4 py-2 text-sm ${
            message.type === "success"
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-red-500/20 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
