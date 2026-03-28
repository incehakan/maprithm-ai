type SyncState = {
  lastSuccessfulSyncAt: Date | null;
  lastAttemptedSyncAt: Date | null;
  lastWebhookSeenAt: Date | null;
  lastReconcileAt: Date | null;
  lastStatus: string | null;
  lastErrorMessage: string | null;
} | null;

type Running = {
  id: string;
  syncType: string;
  startedAt: Date | null;
} | null;

type LatestFailed = {
  id: string;
  finishedAt: Date | null;
  errorMessage: string | null;
} | null;

function formatShort(d: Date | null | undefined) {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function statusTone(status: string | null | undefined): string {
  if (status === "completed") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
  if (status === "running") return "border-sky-500/40 bg-sky-500/10 text-sky-100";
  if (status === "queued") return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  if (status === "failed") return "border-rose-500/40 bg-rose-500/10 text-rose-100";
  if (status === "partial") return "border-violet-500/40 bg-violet-500/10 text-violet-100";
  return "border-white/10 bg-white/[0.04] text-slate-200";
}

type Props = {
  syncState: SyncState;
  running: Running;
  latestFailed: LatestFailed;
  recentJobs: Array<{
    id: string;
    syncType: string;
    status: string;
    finishedAt: Date | null;
    packagesFetchedCount: number;
    failedCount: number;
    createdAt: Date;
  }>;
};

export function OrderSyncStatusPanel({
  syncState,
  running,
  latestFailed,
  recentJobs
}: Props) {
  return (
    <div className="card border border-white/10 bg-white/[0.02]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-100">Sipariş senkron durumu</div>
          <p className="mt-1 text-xs text-slate-500">
            Arka plan işleri ve son başarılı çekim zamanı (store bazlı).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {running && (
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${statusTone("running")}`}
            >
              Çalışıyor · {running.syncType}
            </span>
          )}
          {!running && syncState?.lastStatus && (
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${statusTone(syncState.lastStatus)}`}
            >
              Son iş: {syncState.lastStatus}
            </span>
          )}
        </div>
      </div>

      <dl className="mt-4 grid gap-3 text-xs md:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-slate-500">Son başarılı senkron</dt>
          <dd className="mt-0.5 text-slate-200">
            {formatShort(syncState?.lastSuccessfulSyncAt ?? null)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Son deneme</dt>
          <dd className="mt-0.5 text-slate-200">
            {formatShort(syncState?.lastAttemptedSyncAt ?? null)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Son webhook</dt>
          <dd className="mt-0.5 text-slate-200">
            {formatShort(syncState?.lastWebhookSeenAt ?? null)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Son uzlaştırma</dt>
          <dd className="mt-0.5 text-slate-200">
            {formatShort(syncState?.lastReconcileAt ?? null)}
          </dd>
        </div>
      </dl>

      {latestFailed?.errorMessage && (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          <span className="font-medium">Son hata: </span>
          {latestFailed.errorMessage}
        </div>
      )}

      {recentJobs.length > 0 && (
        <details className="mt-4 rounded-lg border border-slate-700/80 bg-slate-950/30">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-300">
            Son senkron işleri ({recentJobs.length})
          </summary>
          <ul className="divide-y divide-slate-800 px-3 pb-2 text-xs text-slate-400">
            {recentJobs.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-mono text-[10px] text-slate-500">{j.id.slice(0, 8)}…</span>
                <span className="text-slate-300">{j.syncType}</span>
                <span className={statusTone(j.status)}>{j.status}</span>
                <span>
                  çekilen {j.packagesFetchedCount}
                  {j.failedCount ? ` · hata ${j.failedCount}` : ""}
                </span>
                <span>{formatShort(j.finishedAt ?? j.createdAt)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
