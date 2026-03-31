import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CustomerQuestionAnswerForm } from "@/components/trendyol/CustomerQuestionAnswerForm";
import { PageHeader, PanelSurface, StatusBadge } from "@/components/premium/design-system";
import { hasPermission } from "@/lib/activeStore";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { getTrendyolCustomerQuestionById } from "@/lib/trendyolCustomerQuestions";

type Props = { params: Promise<{ id: string }> };

function ts(n: unknown): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  try {
    return new Date(n).toLocaleString("tr-TR");
  } catch {
    return "—";
  }
}

function line(label: string, value: React.ReactNode) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-white/5 py-2 sm:grid-cols-[160px_1fr] sm:gap-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="text-sm text-slate-200">{value}</div>
    </div>
  );
}

export default async function TrendyolCustomerQuestionDetailPage({ params }: Props) {
  const { id } = await params;

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
      </div>
    );
  }

  let res: Awaited<ReturnType<typeof getTrendyolCustomerQuestionById>>;
  try {
    res = await getTrendyolCustomerQuestionById({
      userId: ctx.userId,
      storeId: ctx.storeId,
      questionId: id
    });
  } catch {
    res = { ok: false, status: 0, message: "Bağlantı veya kimlik hatası." };
  }

  if (!res.ok) {
    if (res.status === 404) notFound();
    return (
      <div className="space-y-4">
        <PageHeader title="Soru detayı" subtitle={`Kimlik: ${id}`} />
        <PanelSurface className="p-6">
          <p className="text-rose-300">{res.message}</p>
          <Link
            href="/trendyol/customer-questions"
            className="mt-4 inline-block text-indigo-400 hover:text-indigo-300"
          >
            ← Listeye dön
          </Link>
        </PanelSurface>
      </div>
    );
  }

  const row = res.data as Record<string, unknown>;
  const status = typeof row.status === "string" ? row.status : "—";
  const canAnswer = hasPermission(ctx.permissionKeys, "trendyol.questions.answer");
  const waiting =
    status === "WAITING_FOR_ANSWER" || status === "WAITING_FOR_APPROVE" || status === "REJECTED";

  const answer = row.answer as Record<string, unknown> | undefined;
  const rejectedAnswer = row.rejectedAnswer as Record<string, unknown> | undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Müşteri sorusu"
        subtitle={`Trendyol soru #${id}`}
        actions={
          <Link
            href="/trendyol/customer-questions"
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/5"
          >
            Liste
          </Link>
        }
      />

      <PanelSurface className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusBadge variant="default">{status}</StatusBadge>
          {row.webUrl && typeof row.webUrl === "string" ? (
            <a
              href={row.webUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              Ürün sayfası
            </a>
          ) : null}
        </div>

        {line("Ürün", String(row.productName ?? "—"))}
        {line("Metin", <span className="whitespace-pre-wrap">{String(row.text ?? "—")}</span>)}
        {line("Kullanıcı adı", String(row.userName ?? "—"))}
        {line("Oluşturulma", ts(row.creationDate))}
        {line("Yanıt süresi mesajı", String(row.answeredDateMessage ?? "—"))}
        {row.reason ? line("Red nedeni", String(row.reason)) : null}
        {row.reportReason ? line("Rapor açıklaması", String(row.reportReason)) : null}

        {answer && typeof answer === "object" ? (
          <>
            {line(
              "Mevcut yanıt",
              <span className="whitespace-pre-wrap">
                {String(answer.text ?? "—")}
                <span className="mt-1 block text-xs text-slate-500">
                  Oluşturma: {ts(answer.creationDate)}
                </span>
              </span>
            )}
          </>
        ) : null}

        {rejectedAnswer && typeof rejectedAnswer === "object" ? (
          <>
            {line(
              "Son reddedilen yanıt",
              <span className="whitespace-pre-wrap text-amber-200/90">
                {String(rejectedAnswer.text ?? "—")}
                <span className="mt-1 block text-xs text-slate-500">
                  {String(rejectedAnswer.reason ?? "")}
                </span>
              </span>
            )}
          </>
        ) : null}
      </PanelSurface>

      {waiting ? (
        <PanelSurface className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-100">Cevap gönder</h2>
          <p className="mb-4 text-xs text-slate-500">
            Trendyol API: yanıt 10–2000 karakter; gönderimden sonra yayın öncesi değerlendirme
            yapılır.{" "}
            <a
              href="https://developers.trendyol.com/v2.0/reference/answerquestion"
              className="text-indigo-400 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Dokümantasyon
            </a>
          </p>
          <CustomerQuestionAnswerForm questionId={id} disabled={!canAnswer} />
        </PanelSurface>
      ) : (
        <PanelSurface className="p-5 text-sm text-slate-400">
          Bu durumda yeni yanıt gönderimi Trendyol kurallarına göre genelde kapalıdır. Gerekirse
          panel veya destek üzerinden kontrol edin.
        </PanelSurface>
      )}
    </div>
  );
}
