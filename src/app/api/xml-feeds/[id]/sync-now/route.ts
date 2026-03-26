import { NextResponse } from "next/server";
import { runXmlFeedSync } from "@/lib/xmlFeedSync";
import { requireActiveStore } from "@/lib/requireActiveStore";

type Params = { params: { id: string } };

function getUserIdFromSession(session: { user?: { id?: string } | null } | null): string | null {
  return session?.user?.id ?? null;
}

export async function POST(_request: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ success: false, message: msg }, { status: 401 });
  }

  try {
    const summary = await runXmlFeedSync({
      userId: ctx.userId,
      storeId: ctx.storeId,
      xmlFeedSourceId: params.id,
      trigger: "manual"
    });

    return NextResponse.json({
      success: true,
      message: "XML feed senkronu tamamlandı.",
      ...summary
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Senkron başarısız.";
    if (message.includes("zaten çalışıyor")) {
      return NextResponse.json(
        { success: false, message, error: message },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, message: "XML feed senkronu başarısız.", error: message },
      { status: 500 }
    );
  }
}
