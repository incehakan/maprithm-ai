import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/requireSystemAdmin";
import { getTestLabVerification } from "@/lib/testLabOperations";

export async function GET(request: Request) {
  try {
    await requireSystemAdmin();
  } catch {
    return NextResponse.json({ success: false, error: "Yetkisiz." }, { status: 403 });
  }

  const url = new URL(request.url);
  const testSource = url.searchParams.get("testSource")?.trim() ?? "";
  if (!testSource) {
    return NextResponse.json(
      { success: false, error: "testSource gerekli." },
      { status: 400 }
    );
  }

  try {
    const data = await getTestLabVerification({ testSource });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Verification alınamadı.";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

