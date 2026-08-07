type Props = {
  isSalable: boolean;
  isLocked: boolean;
  isFrozen: boolean;
  isSuspended?: boolean;
};

function Badge({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "warn" | "danger" | "muted";
}) {
  const cls =
    tone === "ok"
      ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
      : tone === "warn"
        ? "bg-amber-500/15 text-amber-200 ring-amber-500/30"
        : tone === "danger"
          ? "bg-rose-500/15 text-rose-300 ring-rose-500/30"
          : "bg-slate-500/15 text-slate-300 ring-slate-500/30";
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cls}`}
    >
      {label}
    </span>
  );
}

export function HepsiburadaListingStatusBadges({
  isSalable,
  isLocked,
  isFrozen,
  isSuspended,
}: Props) {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge
        label={isSalable ? "Satışta" : "Kapalı"}
        tone={isSalable ? "ok" : "muted"}
      />
      {isLocked ? <Badge label="Kilitli" tone="danger" /> : null}
      {isFrozen ? <Badge label="Dondurulmuş" tone="warn" /> : null}
      {isSuspended ? <Badge label="Askıda" tone="warn" /> : null}
    </div>
  );
}
