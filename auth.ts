// Auth.js v5 — Node-Runtime-Teil mit Credentials-Provider.
// Login-Validation gegen die "user"-Tabelle, bcryptjs.
//
// Sessions sind JWT-basiert (kein DB-Session-Store, einfacher und schneller).
// Bei Logout invalidieren wir das Cookie über signOut().

import NextAuth, { type User as AuthUser } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { user as userTable } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { authConfig } from "@/auth.config";
import { hostBereich, hostDbAuswahl } from "@/lib/db/dbAuswahl";

const credentialsSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials, request): Promise<AuthUser | null> {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        
        const host = request.headers.get("host");
        if (!host) return null;
        const bereich = hostBereich(host);
        const requestDb = hostDbAuswahl(host);
        const rows = await requestDb
          .select({
            id: userTable.id,
            email: userTable.email,
            name: userTable.name,
            role: userTable.role,
            companyId: userTable.companyId,
            passwordHash: userTable.passwordHash,
            active: userTable.active,
          })
          .from(userTable)
          .where(eq(userTable.email, email))
          .limit(1);

        const u = rows[0];
        if (!u || !u.passwordHash || !u.active) return null;
        const ok = await verifyPassword(password, u.passwordHash);
        if (!ok) return null;

        // last_login_at aktualisieren (best-effort, kein Fail bei DB-Fehler)
        await requestDb.update(userTable)
          .set({ lastLoginAt: new Date() })
          .where(eq(userTable.id, u.id))
          .catch(() => {});

        return {
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          companyId: u.companyId,
          bereich,
        } as AuthUser & {bereich: "internal" | "external"};
      },
    }),
  ],
});
