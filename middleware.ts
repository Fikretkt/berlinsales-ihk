import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Alle Routen außer Statisches und Next-Internals
  matcher: ["/((?!api/health|api/ready|api/v1/events|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
