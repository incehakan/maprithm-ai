import { NextResponse } from "next/server";
import { createActivityLog } from "@/lib/activityLog";
import { getRequestId } from "@/lib/requestContext";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  createTrendyolWebhook,
  listTrendyolWebhooks,
  validateWebhookBody,
  type TrendyolWebhookUpsertBody
} from "@/lib/trendyolWebhooks";

export const dynamic = "force-dynamic";

function parseBody(raw: unknown): TrendyolWebhookUpsertBody | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const url = typeof o.url === "string" ? o.url : "";
  const authenticationType = o.authenticationType as TrendyolWebhookUpsertBody["authenticationType"];
  if (authenticationType !== "BASIC_AUTHENTICATION" && authenticationType !== "API_KEY") {
    return null;
  }
  const username = typeof o.username === "string" ? o.username : undefined;
  const password = typeof o.password === "string" ? o.password : undefined;
  const apiKey = typeof o.apiKey === "string" ? o.apiKey : undefined;
  let subscribedStatuses: string[] | null | undefined;
  if (Array.isArray(o.subscribedStatuses)) {
    subscribedStatuses = o.subscribedStatuses.filter((x) => typeof x === "string") as string[];
  } else if (o.subscribedStatuses === null) {
    subscribedStatuses = null;
  }
  return {
    url,
    authenticationType,
    username,
    password,
    apiKey,
    subscribedStatuses
  };
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch {
    return NextResponse.json({ success: false, error: "Yetkisiz.", requestId }, { status: 401 });
  }
  try {
    requirePermission(ctx, "marketplace.integrations.manage");
  } catch {
    return NextResponse.json({ success: false, error: "Erişim yok.", requestId }, { status: 403 });
  }

  try {
    const res = await listTrendyolWebhooks({
      userId: ctx.userId,
      storeId: ctx.storeId,
      requestId
    });
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: res.message, requestId },
        { status: res.status >= 400 && res.status < 600 ? res.status : 502 }
      );
    }
    return NextResponse.json({ success: true, data: res.data, requestId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Webhook listesi alınamadı.";
    return NextResponse.json({ success: false, error: msg, requestId }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch {
    return NextResponse.json({ success: false, error: "Yetkisiz.", requestId }, { status: 401 });
  }
  try {
    requirePermission(ctx, "marketplace.integrations.manage");
  } catch {
    return NextResponse.json({ success: false, error: "Erişim yok.", requestId }, { status: 403 });
  }

  const raw = await request.json().catch(() => null);
  const body = parseBody(raw);
  if (!body) {
    return NextResponse.json(
      { success: false, error: "Geçersiz gövde (url, authenticationType).", requestId },
      { status: 400 }
    );
  }
  const v = validateWebhookBody(body);
  if (!v.ok) {
    return NextResponse.json({ success: false, error: v.error, requestId }, { status: 400 });
  }

  try {
    const res = await createTrendyolWebhook({
      userId: ctx.userId,
      storeId: ctx.storeId,
      body,
      requestId
    });
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: res.message, requestId },
        { status: res.status >= 400 && res.status < 600 ? res.status : 502 }
      );
    }
    const wid =
      res.data && typeof res.data === "object" && "id" in res.data
        ? String((res.data as { id: unknown }).id)
        : "";
    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "TRENDYOL_WEBHOOK_CREATED",
      entityType: "trendyol_webhook",
      entityId: wid || "new",
      message: `Webhook oluşturuldu: ${body.url.slice(0, 120)}`
    });
    return NextResponse.json({ success: true, data: res.data, requestId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Webhook oluşturulamadı.";
    return NextResponse.json({ success: false, error: msg, requestId }, { status: 500 });
  }
}
