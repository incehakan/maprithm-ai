import {
  buildTrackingTimeline,
  resolveCargoProviderDisplay
} from "@/lib/trendyolTracking";
import { packageStatusTR } from "@/components/orders/orderDisplayHelpers";
import { OrderTrackingCopyButton } from "@/components/orders/OrderTrackingCopyButton";

export type OrderCargoTrackingCardProps = {
  shipmentPackageId: string;
  packageStatus: string | null;
  packageStatusUpdatedAt: Date | null;
  orderDate: Date;
  cargoTrackingNumber: string | null;
  cargoTrackingLink: string | null;
  cargoProviderName: string | null;
  cargoProviderCode: string | null;
  cargoStatusText: string | null;
  cargoLastEventAt: Date | null;
  cargoLastEventMessage: string | null;
  trackingEvents: Array<{
    id: string;
    eventTitle: string;
    eventDescription: string | null;
    eventDateTime: Date | null;
  }>;
};

function formatDt(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(d);
  } catch {
    return "—";
  }
}

function cargoBadgeClass(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (/teslim|delivered|dağıtım/.test(s))
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
  if (/yolda|transit|kargo|shipped/.test(s))
    return "border-sky-500/40 bg-sky-500/10 text-sky-100";
  if (/iptal|cancel|iade|return/.test(s))
    return "border-rose-500/40 bg-rose-500/10 text-rose-100";
  return "border-white/15 bg-white/[0.06] text-slate-200";
}

export function OrderCargoTrackingCard(props: OrderCargoTrackingCardProps) {
  const carrier = resolveCargoProviderDisplay(
    props.cargoProviderCode,
    props.cargoProviderName
  );
  const hasDetailTracking =
    props.trackingEvents.length > 0 ||
    Boolean(
      props.cargoTrackingNumber ||
        props.cargoTrackingLink ||
        props.cargoStatusText ||
        props.cargoProviderName ||
        props.cargoProviderCode
    );

  const timeline = buildTrackingTimeline({
    shipmentPackageId: props.shipmentPackageId,
    packageStatus: props.packageStatus,
    orderCreatedAt: props.orderDate,
    packageStatusUpdatedAt: props.packageStatusUpdatedAt,
    cargoLastEventAt: props.cargoLastEventAt,
    cargoLastEventMessage: props.cargoLastEventMessage,
    dbEvents: props.trackingEvents.map((e) => ({
      id: e.id,
      eventTitle: e.eventTitle,
      eventDescription: e.eventDescription,
      eventDateTime: e.eventDateTime
    }))
  });

  const summaryParts = [
    `Paket: ${packageStatusTR(props.packageStatus)}`,
    props.cargoStatusText
      ? `Kargo bildirimi: ${props.cargoStatusText}`
      : props.cargoLastEventMessage
        ? `Son hareket: ${props.cargoLastEventMessage}`
        : null
  ].filter(Boolean);

  const displayStatus =
    props.cargoStatusText ?? props.cargoLastEventMessage ?? "Takip bilgisi bekleniyor";

  return (
    <div className="card space-y-6 overflow-hidden border border-indigo-500/25 bg-gradient-to-b from-indigo-500/[0.07] to-transparent">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-50">Kargo takibi</div>
          <p className="mt-1 text-xs text-slate-500">
            Paket kimliği{" "}
            <span className="font-mono text-slate-300">{props.shipmentPackageId}</span>
          </p>
        </div>
        <span
          className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-medium ${cargoBadgeClass(displayStatus)}`}
        >
          {displayStatus.length > 48 ? `${displayStatus.slice(0, 48)}…` : displayStatus}
        </span>
      </div>

      {!hasDetailTracking ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-600/80 bg-slate-950/40 py-14 text-center">
          <div
            className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-slate-600/60 bg-slate-800/50"
            aria-hidden
          >
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              KGO
            </span>
          </div>
          <p className="max-w-md text-sm font-medium text-slate-200">
            Bu paket için henüz kargo takip bilgisi oluşmadı.
          </p>
          <p className="mt-2 max-w-md text-xs text-slate-500">
            Taşıyıcı ataması veya takip numarası Trendyol tarafında göründüğünde burada
            özetlenir. Senkron veya webhook ile otomatik güncellenir.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-2">
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">
                  Taşıyıcı
                </div>
                <div className="mt-0.5 font-medium text-slate-100">{carrier}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">
                  Takip numarası
                </div>
                {props.cargoTrackingNumber ? (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className="font-mono text-xs text-slate-200 break-all max-w-[min(100%,28rem)]"
                      title={props.cargoTrackingNumber}
                    >
                      {props.cargoTrackingNumber.length > 36
                        ? `${props.cargoTrackingNumber.slice(0, 18)}…${props.cargoTrackingNumber.slice(-10)}`
                        : props.cargoTrackingNumber}
                    </span>
                    <OrderTrackingCopyButton text={props.cargoTrackingNumber} />
                  </div>
                ) : (
                  <div className="mt-0.5 text-slate-500">—</div>
                )}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">
                  Son güncelleme
                </div>
                <div className="mt-0.5 text-xs text-slate-300">
                  {props.cargoLastEventAt
                    ? formatDt(props.cargoLastEventAt.toISOString())
                    : props.packageStatusUpdatedAt
                      ? formatDt(props.packageStatusUpdatedAt.toISOString())
                      : "—"}
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-between gap-3 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">
                  Kısa özet
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">
                  {summaryParts.join(" · ")}
                </p>
              </div>
              {props.cargoTrackingLink && props.cargoTrackingNumber ? (
                <a
                  href={props.cargoTrackingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-fit items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-900/30 hover:bg-indigo-500"
                >
                  Kargoyu takip et
                </a>
              ) : props.cargoTrackingLink && !props.cargoTrackingNumber ? (
                <span className="text-xs text-slate-500">
                  Takip numarası olmadan güvenli bağlantı gösterilmiyor.
                </span>
              ) : (
                <span className="text-xs text-slate-500">
                  Bu taşıyıcı için otomatik takip bağlantısı üretilemedi.
                </span>
              )}
            </div>
          </div>

          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Hareket zaman çizelgesi
            </div>
            <div className="relative pl-7">
              <div className="absolute bottom-0 left-[9px] top-2 w-px bg-gradient-to-b from-indigo-400/50 via-white/15 to-transparent" />
              <ul className="space-y-5">
                {timeline.map((item) => (
                  <li key={item.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-indigo-400/80 bg-slate-950 shadow-[0_0_0_4px_rgba(99,102,241,0.12)]" />
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-slate-100">{item.eventTitle}</div>
                      {item.eventDescription && (
                        <div className="text-xs text-slate-400">{item.eventDescription}</div>
                      )}
                      <div className="text-[11px] text-slate-500">{formatDt(item.eventDateTime)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
