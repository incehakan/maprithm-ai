"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { safeParseJsonResponse } from "@/lib/safeParseJsonResponse";

type JobRow = {
  status: string;
  packagesFetchedCount?: number;
  failedCount?: number;
  errorMessage?: string | null;
};

export function OrdersHepsiburadaSyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function stopPoll() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function pollJob(id: string) {
    stopPoll();
    const tick = async () => {
      try {
        const st = await fetch(`/api/orders/hepsiburada/sync?jobId=${encodeURIComponent(id)}`);
        const data = await safeParseJsonResponse(st);
        if (!data || (data as { success?: boolean }).success !== true) return false;
        const jobs = (data as { jobs?: JobRow[] }).jobs;
        const job = jobs?.[0];
        if (!job) return false;
        if (job.status === "queued" || job.status === "running") return false;
        stopPoll();
        setLoading(false);
        if (job.status === "failed") {
          setError(job.errorMessage ?? "Senkron başarısız.");
        } else {
          setMessage(
            `Senkron tamam (${job.status}). Çekilen: ${job.packagesFetchedCount ?? 0}${
              (job.failedCount ?? 0) > 0 ? `, hata: ${job.failedCount}` : ""
            }.`
          );
        }
        router.refresh();
        return true;
      } catch {
        return false;
      }
    };
    void tick();
    pollRef.current = setInterval(() => {
      void tick();
    }, 2000);
  }

  async function sync() {
    setLoading(true);
    setMessage(null);
    setError(null);
    setJobId(null);
    stopPoll();
    try {
      const res = await fetch("/api/orders/hepsiburada/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = await safeParseJsonResponse(res);
      if (!res.ok || !data || (data as { success?: boolean }).success !== true) {
        setError((data as { error?: string })?.error ?? "Senkron başlatılamadı.");
        setLoading(false);
        return;
      }
      const id = (data as { jobId?: string }).jobId;
      const msg = (data as { message?: string }).message;
      setMessage(msg ?? "Senkron başlatıldı…");
      if (id) {
        setJobId(id);
        void pollJob(id);
      } else {
        setLoading(false);
      }
    } catch {
      setError("İstek başarısız.");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn-secondary"
        disabled={loading}
        onClick={() => void sync()}
      >
        {loading ? "Senkron kuyrukta / çalışıyor…" : "Hepsiburada — Senkron Et"}
      </button>
      {jobId && loading && (
        <span className="max-w-xs text-right text-[10px] text-slate-500">
          İş no: <span className="font-mono text-slate-400">{jobId.slice(0, 8)}…</span>
        </span>
      )}
      {message && <span className="text-xs text-emerald-400">{message}</span>}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
