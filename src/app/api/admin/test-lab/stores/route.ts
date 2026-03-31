import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSystemAdmin } from "@/lib/requireSystemAdmin";

export async function GET() {
  try {
    await requireSystemAdmin();
  } catch {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  }

  const stores = await prisma.store.findMany({
    where: { status: "active" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true }
  });

  return NextResponse.json({ success: true, stores });
}

