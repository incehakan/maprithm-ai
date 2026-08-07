"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { extractApiErrorMessage } from "@/lib/apiErrorMessage";

export function CustomerQuestionAnswerForm({
  questionId,
  disabled
}: {
  questionId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  if (disabled) {
    return (
      <p className="text-sm text-slate-500">
        Cevap göndermek için <code className="text-slate-400">trendyol.questions.answer</code> izni
        gerekir.
      </p>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    const trimmed = text.trim();
    if (trimmed.length < 10 || trimmed.length > 2000) {
      setError("Cevap 10–2000 karakter olmalıdır.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/integrations/trendyol/customer-questions/${encodeURIComponent(questionId)}/answer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed })
        }
      );
      const j = (await res.json().catch(() => ({}))) as unknown;
      if (!res.ok || !(j as { success?: boolean })?.success) {
        setError(extractApiErrorMessage(j, "Gönderim başarısız."));
        return;
      }
      setOk("Cevap Trendyol'a iletildi (yayın öncesi değerlendirmede).");
      setText("");
      router.refresh();
    } catch {
      setError("Ağ hatası.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">
          Cevap metni (Trendyol: min 10, max 2000 karakter)
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          className="w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500/50 focus:outline-none"
          placeholder="Merhaba, ürünümüz hakkında..."
          disabled={loading}
        />
        <div className="mt-1 text-[11px] text-slate-500">{text.trim().length} karakter</div>
      </div>
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {ok ? <p className="text-sm text-emerald-400">{ok}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {loading ? "Gönderiliyor…" : "Cevabı gönder"}
      </button>
    </form>
  );
}
