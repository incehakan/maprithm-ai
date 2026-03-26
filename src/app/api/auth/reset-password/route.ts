import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

type Body = {
  email?: unknown;
  newPassword?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const newPassword =
    typeof body?.newPassword === "string" ? body.newPassword : "";

  if (!email) {
    return NextResponse.json(
      { success: false, error: "Email zorunludur." },
      { status: 400 }
    );
  }
  if (!newPassword || newPassword.length < 6) {
    return NextResponse.json(
      { success: false, error: "Yeni şifre en az 6 karakter olmalıdır." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true }
  });
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Bu email ile kullanıcı bulunamadı." },
      { status: 404 }
    );
  }

  const hashed = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed }
  });

  return NextResponse.json({ success: true });
}

