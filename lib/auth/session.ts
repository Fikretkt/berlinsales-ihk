// Server-seitige Session-Helper für API-Routes.
// HttpError + SessionUser sind in lib/http/errors.ts — keine Auth.js-Abhängigkeit
// für Tests und Business-Logic.

import { auth } from "@/auth";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { company as companyTable, user as userTable } from "@/lib/db/schema";
import { HttpError, type SessionUser } from "@/lib/http/errors";
import { assertDevImpersonationAllowed } from "@/lib/auth/dev-impersonation";

export { HttpError };
export type { SessionUser };

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getSessionUser(): Promise<SessionUser | null> {
  const devEmail = (await headers()).get("x-dev-user-email");
  if (devEmail) {
    assertDevImpersonationAllowed(devEmail);
    const rows = await db
      .select({
        id: userTable.id,
        email: userTable.email,
        name: userTable.name,
        role: userTable.role,
        companyId: userTable.companyId,
        active: userTable.active,
        companyIdRef: companyTable.id,
      })
      .from(userTable)
      .leftJoin(companyTable, eq(userTable.companyId, companyTable.id))
      .where(eq(userTable.email, devEmail))
      .limit(1);
    const devUser = rows[0];
    if (!devUser) {
      console.warn("[auth] Session rejected: SESSION_DEV_USER_NOT_FOUND");
      return null;
    }
    if (!devUser.active) {
      console.warn("[auth] Session rejected: SESSION_DEV_USER_INACTIVE");
      return null;
    }
    if (!devUser.companyIdRef) {
      console.warn("[auth] Session rejected: SESSION_DEV_TENANT_INVALID");
      return null;
    }
    return {
      id: devUser.id,
      email: devUser.email,
      name: devUser.name,
      role: devUser.role,
      companyId: devUser.companyId,
    };
  }

  const session = await auth();
  if (!session?.user?.id) return null;

  // Validate format of user ID before querying to avoid DB syntax errors on malformed tokens
  if (!UUID_REGEX.test(session.user.id)) {
    console.warn("[auth] Session rejected: SESSION_INVALID_USER_ID");
    return null;
  }

  // JWT claims are intentionally not trusted as current authorization state:
  // deactivation, role, and company changes take effect on the next request.
  // Note: Database/infrastructure failures (e.g. connection error, query timeout)
  // are intentionally NOT converted into null. They must propagate to standard
  // 5xx error handling so database outages do not masquerade as unauthenticated sessions.
  const rows = await db
    .select({
      id: userTable.id,
      email: userTable.email,
      name: userTable.name,
      role: userTable.role,
      companyId: userTable.companyId,
      active: userTable.active,
      companyIdRef: companyTable.id,
    })
    .from(userTable)
    .leftJoin(companyTable, eq(userTable.companyId, companyTable.id))
    .where(eq(userTable.id, session.user.id))
    .limit(1);

  const currentUser = rows[0];
  if (!currentUser) {
    console.warn("[auth] Session rejected: SESSION_USER_NOT_FOUND");
    return null;
  }
  if (!currentUser.active) {
    console.warn("[auth] Session rejected: SESSION_USER_INACTIVE");
    return null;
  }
  if (!currentUser.companyIdRef) {
    console.warn("[auth] Session rejected: SESSION_TENANT_INVALID");
    return null;
  }

  return {
    id: currentUser.id,
    email: currentUser.email,
    name: currentUser.name,
    role: currentUser.role,
    companyId: currentUser.companyId,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new HttpError(401, "NOT_AUTHENTICATED", "Nicht eingeloggt");
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "admin") {
    throw new HttpError(403, "FIELD_USER_NOT_ALLOWED", "Diese Aktion ist Admins vorbehalten");
  }
  return u;
}
