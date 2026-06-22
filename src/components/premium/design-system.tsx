import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function AppShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#0b0f19] text-slate-100">{children}</div>;
}

export function PanelSurface({
  className,
  children
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_80px_-36px_rgba(30,41,59,0.9)] backdrop-blur-xl",
        className
      )}
    >
      {children}
    </div>
  );
}

export const GlassCard = PanelSurface;
export const SettingsSectionCard = PanelSurface;
export const IntegrationStatusCard = PanelSurface;
export const MetricCard = PanelSurface;

export function PageHeader({
  title,
  subtitle,
  actions
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  right
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/10 pb-2">
      <div>
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

const premiumButton = cva(
  "inline-flex items-center justify-center rounded-xl text-sm font-medium transition duration-200 disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-r from-indigo-500 via-violet-500 to-blue-500 px-4 py-2 text-white shadow-[0_10px_30px_-12px_rgba(99,102,241,0.75)] hover:translate-y-[-1px] hover:brightness-110",
        secondary:
          "border border-white/10 bg-white/[0.03] px-4 py-2 text-slate-200 hover:border-indigo-400/40 hover:bg-white/[0.06]"
      }
    },
    defaultVariants: {
      variant: "primary"
    }
  }
);

export function PremiumButton({
  className,
  variant,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof premiumButton>) {
  return <button className={cn(premiumButton({ variant }), className)} {...props} />;
}

export function PremiumInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("input", props.className)} {...props} />;
}

export { Select as PremiumSelect } from "@/components/ui/select";

const statusBadge = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
  {
    variants: {
      variant: {
        default: "border-white/15 bg-white/[0.04] text-slate-200",
        success: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
        warning: "border-amber-400/30 bg-amber-400/10 text-amber-200",
        danger: "border-rose-400/30 bg-rose-400/10 text-rose-200"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export function StatusBadge({
  className,
  variant,
  children
}: {
  className?: string;
  variant?: VariantProps<typeof statusBadge>["variant"];
  children: React.ReactNode;
}) {
  return <span className={cn(statusBadge({ variant }), className)}>{children}</span>;
}

export function EmptyState({
  title,
  description,
  ctaHref,
  ctaLabel
}: {
  title: string;
  description: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
      <div className="pointer-events-none absolute -top-10 left-1/2 h-24 w-24 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-2xl" />
      <div className="mx-auto mb-3 h-10 w-10 rounded-xl border border-white/15 bg-gradient-to-br from-white/[0.1] to-white/[0.02]" />
      <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">{description}</p>
      {ctaHref && ctaLabel && (
        <Link href={ctaHref} className="btn-primary mt-4 inline-flex">
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}

export function PremiumTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02] p-2">
      <table className="table-modern min-w-full">{children}</table>
    </div>
  );
}

export function KPIStatCard({
  label,
  value,
  tone = "default",
  detail,
  trend,
  icon: Icon
}: {
  label: string;
  value: string;
  detail?: string;
  trend?: string;
  icon?: LucideIcon;
  tone?: "default" | "important" | "warning";
}) {
  const toneClass =
    tone === "important"
      ? "from-indigo-500/30 via-violet-500/20 to-blue-500/20"
      : tone === "warning"
        ? "from-amber-500/20 via-amber-400/10 to-transparent"
        : "from-white/[0.08] via-white/[0.02] to-transparent";
  return (
    <PanelSurface
      className={cn(
        "group relative overflow-hidden border-white/15 transition duration-300 hover:-translate-y-1 hover:border-indigo-300/35"
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-90",
          toneClass
        )}
      />
      <div className="pointer-events-none absolute -right-7 -top-7 h-20 w-20 rounded-full bg-white/10 blur-2xl transition group-hover:bg-indigo-400/20" />
      <div className="relative">
        <div className="flex items-start justify-between">
          <div className="text-xs uppercase tracking-[0.14em] text-slate-300/80">{label}</div>
          {Icon ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.06] p-1.5 text-indigo-200">
              <Icon className="h-4 w-4" />
            </div>
          ) : null}
        </div>
        <div className="mt-2 text-4xl font-semibold tracking-tight text-white">{value}</div>
        {detail && <div className="mt-2 text-xs text-slate-400">{detail}</div>}
        {trend ? <div className="mt-1 text-xs font-medium text-emerald-300">{trend}</div> : null}
      </div>
    </PanelSurface>
  );
}

