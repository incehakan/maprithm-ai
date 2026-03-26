import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import { verifyPassword } from "./password";
import { resolveActiveStoreContextForUser } from "@/lib/activeStore";

export const { auth, signIn, signOut, handlers } = NextAuth({
  providers: [
    Credentials({
      name: "Email ve Şifre",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Şifre", type: "password" }
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        let user;
        try {
          user = await prisma.user.findUnique({
            where: { email }
          });
        } catch (err) {
          console.error("auth.authorize user lookup failed", err);
          return null;
        }

        if (!user) return null;

        let isValid = false;
        try {
          isValid = await verifyPassword(password, user.password);
        } catch (err) {
          console.error("auth.authorize password verify failed", err);
          return null;
        }
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email
        };
      }
    })
  ],
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/login"
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = (user as any).id;
      }

      // Aktif mağaza + permissionKeys her oturum yenilemesinde güncellenir.
      // (Seed / rol değişince eski JWT'de kalan izinler güncellenmezdi; örn. products.view kayboluyordu.)
      if (token.userId) {
        try {
          const ctx = await resolveActiveStoreContextForUser({
            userId: String(token.userId),
            preferredStoreId: token.activeStoreId
              ? String(token.activeStoreId)
              : null
          });
          if (ctx) {
            token.activeStoreId = ctx.storeId;
            token.membershipId = ctx.membershipId;
            token.roleKey = ctx.roleKey;
            token.permissionKeys = ctx.permissionKeys;
          } else {
            token.activeStoreId = null;
            token.membershipId = null;
            token.roleKey = null;
            token.permissionKeys = [];
          }
        } catch (err) {
          console.error("auth.jwt active store resolve failed", err);
          token.activeStoreId = null;
          token.membershipId = null;
          token.roleKey = null;
          token.permissionKeys = [];
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        (session.user as any).id = token.userId;
      }

      (session as any).activeStoreId = token.activeStoreId ?? null;
      (session as any).membershipId = token.membershipId ?? null;
      (session as any).roleKey = token.roleKey ?? null;
      (session as any).permissionKeys = token.permissionKeys ?? [];

      return session;
    }
  }
});

