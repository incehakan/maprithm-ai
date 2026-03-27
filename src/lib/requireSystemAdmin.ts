import { auth } from "@/lib/auth";

export type RequiredSystemAdminContext = {
  userId: string;
  isSystemAdmin: true;
};

export async function requireSystemAdmin(): Promise<RequiredSystemAdminContext> {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const isSystemAdmin = Boolean((session as any)?.isSystemAdmin);

  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }
  if (!isSystemAdmin) {
    throw new Error("FORBIDDEN");
  }

  return { userId, isSystemAdmin: true };
}

