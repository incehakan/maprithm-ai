import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    activeStoreId?: string | null;
    membershipId?: string | null;
    roleKey?: string | null;
    permissionKeys?: string[];
    user?: DefaultSession["user"] & {
      id?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    activeStoreId?: string | null;
    membershipId?: string | null;
    roleKey?: string | null;
    permissionKeys?: string[];
  }
}
