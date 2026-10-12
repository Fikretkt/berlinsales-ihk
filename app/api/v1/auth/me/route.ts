// GET /api/v1/auth/me — aktueller User.

import { auth } from "@/auth";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { user as userTable, company as companyTable } from "@/lib/db/schema";
import { fail, ok } from "@/lib/http/response";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return fail({ code: "NOT_AUTHENTICATED", message: "Nicht eingeloggt" }, 401);
  }
  const rows = await db
    .select({
      id: userTable.id,
      email: userTable.email,
      name: userTable.name,
      role: userTable.role,
      active: userTable.active,
      companyId: userTable.companyId,
      companyName: companyTable.name,
    })
    .from(userTable)
    .innerJoin(companyTable, eq(companyTable.id, userTable.companyId))
    .where(eq(userTable.id, session.user.id))
    .limit(1);
  const u = rows[0];
  if (!u || !u.active) {
    return fail({ code: "NOT_AUTHENTICATED", message: "Nicht eingeloggt" }, 401);
  }
  return ok({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    company: { id: u.companyId, name: u.companyName },
  });
}
