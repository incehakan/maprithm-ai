import Link from "next/link";
import { packageStatusTR } from "./orderDisplayHelpers";

export type RelatedPackageRow = {
  id: string;
  shipmentPackageId: string;
  packageStatus: string | null;
  isSplitPackage: boolean;
  orderNumber: string;
};

type Props = {
  currentId: string;
  packages: RelatedPackageRow[];
};

export function OrderRelatedPackages({ currentId, packages }: Props) {
  const others = packages.filter((p) => p.id !== currentId);

  return (
    <div className="card space-y-4">
      <div className="text-sm font-semibold text-slate-100">İlişkili paketler</div>
      <p className="text-xs text-slate-500">
        Aynı kök sipariş numarasına bağlı diğer gönderim paketleri.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {others.map((p) => (
          <Link
            key={p.id}
            href={`/orders/${p.id}`}
            className="group rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-indigo-500/40 hover:bg-white/[0.06]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-mono text-xs text-indigo-200">{p.shipmentPackageId}</div>
                <div className="mt-1 text-sm text-slate-200">{packageStatusTR(p.packageStatus)}</div>
                <div className="mt-1 text-xs text-slate-500">Sipariş: {p.orderNumber}</div>
              </div>
              {p.isSplitPackage && (
                <span className="shrink-0 rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-100">
                  Split
                </span>
              )}
            </div>
            <div className="mt-2 text-xs text-indigo-300/80 opacity-0 transition group-hover:opacity-100">
              Detayı aç →
            </div>
          </Link>
        ))}
        {others.length === 0 && (
          <p className="text-xs text-slate-500 sm:col-span-2">Başlı başına tek paket görünüyor.</p>
        )}
      </div>
    </div>
  );
}
