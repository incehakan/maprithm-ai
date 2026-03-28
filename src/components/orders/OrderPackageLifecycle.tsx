import { buildOrderTimeline, type TimelineEventInput } from "@/lib/orderLifecycle";

type Props = {
  events: TimelineEventInput[];
  currentStatus: string | null;
  packageStatusUpdatedAt: Date | null;
  previousStatusFromTimeline: string | null;
  isSplitPackage: boolean;
  parentShipmentPackageId: string | null;
  splitDetectedAt: Date | null;
  rootOrderNumber: string;
};

function badgeTone(kind: string | undefined): string {
  if (kind === "invalid") return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  if (kind === "valid" || kind === "initial") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
  return "border-white/10 bg-white/[0.04] text-slate-200";
}

export function OrderPackageLifecycle({
  events,
  currentStatus,
  packageStatusUpdatedAt,
  previousStatusFromTimeline,
  isSplitPackage,
  parentShipmentPackageId,
  splitDetectedAt,
  rootOrderNumber
}: Props) {
  const timeline = buildOrderTimeline(events, { maxItems: 60 });

  return (
    <div className="card space-y-4">
      <div>
        <div className="text-sm font-semibold text-slate-100">Paket yaşam döngüsü</div>
        <p className="mt-1 text-xs text-slate-500">
          Kök sipariş no: <span className="font-mono text-slate-300">{rootOrderNumber}</span>
        </p>
      </div>

      <div className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 md:grid-cols-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Güncel statü</div>
          <div className="mt-1 text-sm font-medium text-slate-100">{currentStatus ?? "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Son statü zamanı</div>
          <div className="mt-1 text-xs text-slate-300">
            {packageStatusUpdatedAt?.toISOString() ?? "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Önceki (timeline)</div>
          <div className="mt-1 text-xs text-slate-300">{previousStatusFromTimeline ?? "—"}</div>
        </div>
      </div>

      {(isSplitPackage || parentShipmentPackageId) && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
          {isSplitPackage ? (
            <p>
              Bu paket{" "}
              <strong className="text-white">
                {parentShipmentPackageId ? `üst paketten (${parentShipmentPackageId})` : "başka bir paketten"}{" "}
              </strong>
              ayrılmış bir <strong className="text-white">split paket</strong> olarak işaretlendi.
              {splitDetectedAt && (
                <span className="mt-1 block text-xs text-violet-200/90">
                  Tespit: {splitDetectedAt.toISOString()}
                </span>
              )}
            </p>
          ) : (
            <p>Üst paket referansı: {parentShipmentPackageId ?? "—"}</p>
          )}
        </div>
      )}

      <div className="relative pl-6">
        <div className="absolute bottom-0 left-[11px] top-2 w-px bg-gradient-to-b from-indigo-500/40 via-white/10 to-transparent" />
        <ul className="space-y-5">
          {timeline.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute left-[-19px] top-1.5 h-2.5 w-2.5 rounded-full border border-indigo-400/80 bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.45)]" />
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-lg border px-2 py-0.5 text-[11px] font-medium ${badgeTone(
                    e.kind
                  )}`}
                >
                  {e.action}
                </span>
                <span className="text-xs text-slate-500">{e.createdAt.toISOString()}</span>
              </div>
              <p className="mt-1 text-sm text-slate-300">{e.message}</p>
              {(e.previousStatus != null || e.nextStatus != null) && (
                <p className="mt-1 text-xs text-slate-500">
                  {e.previousStatus ?? "—"} → {e.nextStatus ?? "—"}
                  {e.transitionNote ? ` · ${e.transitionNote}` : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
        {timeline.length === 0 && (
          <p className="text-xs text-slate-500">Henüz lifecycle event kaydı yok.</p>
        )}
      </div>
    </div>
  );
}
