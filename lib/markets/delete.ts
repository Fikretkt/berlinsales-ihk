import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AUDIT_EVENTS } from "@/lib/audit/events";
import { HttpError, type SessionUser } from "@/lib/http/errors";

export async function permanentlyDeleteMarket(marketId: string, admin: SessionUser): Promise<void> {
  if (admin.role !== "admin") {
    throw new HttpError(403, "FIELD_USER_NOT_ALLOWED", "Diese Aktion ist Admins vorbehalten");
  }
  await db.transaction(async (tx) => {
    const found = await tx.execute<{ id: string; name: string }>(sql`
      SELECT id, name FROM market
      WHERE id = ${marketId}::uuid AND company_id = ${admin.companyId}::uuid
      FOR UPDATE
    `);
    const market = found.rows[0];
    if (!market) throw new HttpError(404, "MARKET_NOT_FOUND", "Kunde nicht gefunden");

    // action has a RESTRICT FK; the other market-owned records cascade, but are
    // explicitly removed here to keep the deletion transaction unambiguous.
    await tx.execute(sql`DELETE FROM note WHERE market_id = ${marketId}::uuid`);
    await tx.execute(sql`DELETE FROM follow_up WHERE market_id = ${marketId}::uuid`);
    await tx.execute(sql`DELETE FROM reservation WHERE market_id = ${marketId}::uuid`);
    await tx.execute(sql`DELETE FROM action WHERE market_id = ${marketId}::uuid`);
    await tx.execute(sql`DELETE FROM market WHERE id = ${marketId}::uuid AND company_id = ${admin.companyId}::uuid`);
    await tx.execute(sql`
      INSERT INTO audit_log (company_id, user_id, event, payload)
      VALUES (${admin.companyId}::uuid, ${admin.id}::uuid, ${AUDIT_EVENTS.CUSTOMER_DELETED},
        ${JSON.stringify({ customer_id: market.id, customer_name: market.name, deleted_by: admin.id })}::jsonb)
    `);
  });
}
