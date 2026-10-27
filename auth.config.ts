// Edge-kompatibler Teil der Auth.js-Config (für middleware.ts).
// DB-Zugriff geht NICHT in dieser Datei (Edge Runtime kann pg nicht).

import type { NextAuthConfig } from "next-auth";
import { checkRouteAccess } from "@/lib/auth/routing";

export const authConfig = {
  pages: {
    signIn: "/auth/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7, // 7 Tage
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = Boolean(auth?.user?.id);
      const result = checkRouteAccess({
        pathname: nextUrl.pathname,
        isLoggedIn,
      });
      return result.allowed;
    },
    jwt({ token, user }) {
      if (user) {
        token.userId = (user as { id?: string }).id;
        token.role = (user as { role?: string }).role;
        token.companyId = (user as { companyId?: string }).companyId;
        token.bereich = (user as { bereich?: "internal" | "external" }).bereich;
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        if (typeof token.userId === "string") {
          session.user.id = token.userId;
        }
        if (typeof token.role === "string") {
          (session.user as { role?: string }).role = token.role;
        }
        if (typeof token.companyId === "string") {
          (session.user as { companyId?: string }).companyId = token.companyId;
        }
        if (token.bereich === "internal" || token.bereich === "external") {
          (session.user as { bereich?: "internal" | "external" }).bereich = token.bereich;
        }
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
