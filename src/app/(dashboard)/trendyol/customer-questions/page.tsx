import Link from "next/link";
import { redirect } from "next/navigation";
import {
  EmptyState,
  PageHeader,
  PanelSurface,
  PremiumTable,
  StatusBadge
} from "@/components/premium/design-system";
import { hasPermission } from "@/lib/activeStore";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  filterTrendyolCustomerQuestions,
  parseCustomerQuestionsQueryFromSearchParams
} from "@/lib/trendyolCustomerQuestions";

type SearchParams = Record<string, string | string[] | undefined>;

function ts(n: unknown): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  try {
    return new Date(n).toLocaleString("tr-TR");
  } catch {
    return "—";
  }
}

function rowString(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  return typeof v === "string" ? v : v != null ? String(v) : "—";
}

export default async function TrendyolCustomerQuestionsPage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e) {
    if (e instanceof Error && e.message === "NO_ACTIVE_STORE") {
      redirect("/register-store");
    }
    redirect("/login");
  }

  try {
    requirePermission(ctx, "trendyol.questions.view");
  } catch {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-slate-200">
        <p className="font-medium">Bu sayfaya erişim yetkiniz yok</p>
        <p className="mt-1 text-sm text-slate-400">
          Gerekli izin: <code className="text-slate-300">trendyol.questions.view</code>
        </p>
      </div>
    );
  }

  const query = parseCustomerQuestionsQueryFromSearchParams(searchParams);
  if (!query.status) {
    query.status = "WAITING_FOR_ANSWER";
  }

  let listRes: Awaited<ReturnType<typeof filterTrendyolCustomerQuestions>>;
  let loadError: string | null = null;
  try {
    listRes = await filterTrendyolCustomerQuestions({
      userId: ctx.userId,
      storeId: ctx.storeId,
      query
    });
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Trendyol bağlantısı veya API hatası.";
    listRes = { ok: false, status: 0, message: loadError };
  }

  const data = listRes.ok ? (listRes.data as Record<string, unknown>) : null;
  const content = (data?.content as Record<string, unknown>[] | undefined) ?? [];
  const page = typeof data?.page === "number" ? data.page : query.page ?? 0;
  const totalPages =
    typeof data?.totalPages === "number" ? data.totalPages : content.length ? 1 : 0;
  const totalElements =
    typeof data?.totalElements === "number" ? data.totalElements : content.length;

  const buildHref = (nextPage: number) => {
    const p = new URLSearchParams();
    p.set("status", String(query.status ?? "WAITING_FOR_ANSWER"));
    p.set("page", String(nextPage));
    p.set("size", String(query.size ?? 20));
    if (query.barcode?.trim()) p.set("barcode", query.barcode.trim());
    if (query.startDate != null) p.set("startDate", String(query.startDate));
    if (query.endDate != null) p.set("endDate", String(query.endDate));
    if (query.orderByField) p.set("orderByField", query.orderByField);
    if (query.orderByDirection) p.set("orderByDirection", query.orderByDirection);
    return `/trendyol/customer-questions?${p.toString()}`;
  };

  const canAnswer = hasPermission(ctx.permissionKeys, "trendyol.questions.answer");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trendyol müşteri soruları"
        subtitle="Trendyol QnA API: filtreleme, detay ve cevap. Kaynak: developers.trendyol.com"
      />

      <PanelSurface className="p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Durum</label>
            <select
              name="status"
              defaultValue={String(query.status ?? "WAITING_FOR_ANSWER")}
              className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
            >
              <option value="WAITING_FOR_ANSWER">Yanıt bekliyor</option>
              <option value="WAITING_FOR_APPROVE">Onay bekliyor</option>
              <option value="ANSWERED">Yanıtlandı</option>
              <option value="REPORTED">Raporlandı</option>
              <option value="REJECTED">Reddedildi</option>
              <option value="UNANSWERED">Süresi doldu</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Barkod</label>
            <input
              name="barcode"
              defaultValue={query.barcode ?? ""}
              placeholder="Opsiyonel"
              className="w-40 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Sayfa boyutu</label>
            <select
              name="size"
              defaultValue={String(query.size ?? 20)}
              className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </div>
          <input type="hidden" name="page" value="0" />
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Uygula
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          Tarih aralığı için API parametreleri: startDate / endDate (ms timestamp, en fazla 2 hafta).
          Gelişmiş kullanım için REST query ile{" "}
          <code className="text-slate-400">/api/integrations/trendyol/customer-questions</code>{" "}
          çağrılabilir.
        </p>
        {!canAnswer ? (
          <p className="mt-2 text-xs text-amber-200/90">
            Sadece görüntülüyorsunuz. Cevap göndermek için{" "}
            <code className="text-slate-300">trendyol.questions.answer</code> izni gerekir.
          </p>
        ) : null}
      </PanelSurface>

      {loadError || !listRes.ok ? (
        <PanelSurface className="p-6">
          <p className="text-rose-300">
            {listRes.ok === false ? listRes.message : loadError}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Trendyol bağlantınızı (sellerId, API anahtarları) ve ortamı (stage/production)
            kontrol edin.
          </p>
        </PanelSurface>
      ) : content.length === 0 ? (
        <EmptyState
          title="Soru yok"
          description="Seçilen filtrelere göre liste boş."
        />
      ) : (
        <PanelSurface className="overflow-hidden p-0">
          <PremiumTable>
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase text-slate-400">
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Ürün</th>
                <th className="px-4 py-3">Soru</th>
                <th className="px-4 py-3">Oluşturulma</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {content.map((row) => {
                const id = rowString(row, "id");
                const status = rowString(row, "status");
                const text = rowString(row, "text");
                const shortened = text.length > 80 ? `${text.slice(0, 80)}…` : text;
                return (
                  <tr key={id} className="border-b border-white/5 text-sm text-slate-200">
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{id}</td>
                    <td className="px-4 py-3">
                      <StatusBadge variant="default">{status}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {rowString(row, "productName")}
                    </td>
                    <td className="max-w-md px-4 py-3 text-slate-300">{shortened}</td>
                    <td className="px-4 py-3 text-slate-400">{ts(row.creationDate)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/trendyol/customer-questions/${encodeURIComponent(id)}`}
                        className="text-indigo-400 hover:text-indigo-300"
                      >
                        Detay
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </PremiumTable>
          <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-sm text-slate-400">
            <span>
              Toplam {totalElements} · Sayfa {page + 1}/{Math.max(1, totalPages)}
            </span>
            <div className="flex gap-2">
              {page > 0 ? (
                <Link
                  href={buildHref(page - 1)}
                  className="rounded-md border border-white/15 px-3 py-1 text-slate-200 hover:bg-white/5"
                >
                  Önceki
                </Link>
              ) : null}
              {page + 1 < totalPages ? (
                <Link
                  href={buildHref(page + 1)}
                  className="rounded-md border border-white/15 px-3 py-1 text-slate-200 hover:bg-white/5"
                >
                  Sonraki
                </Link>
              ) : null}
            </div>
          </div>
        </PanelSurface>
      )}
    </div>
  );
}
