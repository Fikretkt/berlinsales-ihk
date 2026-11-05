import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMarket } from "@/lib/markets/crud";
import { permanentlyDeleteMarket } from "@/lib/markets/delete";
import { HttpError, type SessionUser } from "@/lib/http/errors";
import { insertAction, makeCompany, makeMarket, makeUser, startTestDatabase, stopTestDatabase, truncateUserData, type TestContext } from "../helpers/db";

function session(id: string, companyId: string, role: SessionUser["role"]): SessionUser {
  return { id, companyId, role, email: `${id}@example.com`, name: "Test User", bereich: "internal" };
}

describe("manual market creation and permanent deletion", () => {
  let ctx: TestContext;
  beforeAll(async () => { ctx = await startTestDatabase(); });
  afterAll(async () => { await stopTestDatabase(ctx); });
  beforeEach(async () => { await truncateUserData(ctx); });

  it("allows field users and admins to create tenant-owned GPS-only customers", async () => {
    const companyA = await makeCompany(ctx, "A");
    const companyB = await makeCompany(ctx, "B");
    const fieldId = await makeUser(ctx, { companyId: companyA, role: "field_user" });
    const adminId = await makeUser(ctx, { companyId: companyA, role: "admin" });
    const fieldCreated = await createMarket({ name: "Field GPS", streetFull: "", lat: 52.52, lng: 13.405, companyId: companyB } as Parameters<typeof createMarket>[0], session(fieldId, companyA, "field_user"));
    const adminCreated = await createMarket({ name: "Admin GPS", streetFull: "", lat: 52.53, lng: 13.406 }, session(adminId, companyA, "admin"));
    const { rows } = await ctx.pool.query<{ id: string; company_id: string; external_id: string | null }>("SELECT id, company_id, external_id FROM market WHERE id = ANY($1::uuid[])", [[fieldCreated.marketId, adminCreated.marketId]]);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.company_id === companyA && row.external_id === null)).toBe(true);
  });

  it("uses the session company and deletes only an admin's own-tenant customer with CRM data", async () => {
    const companyA = await makeCompany(ctx, "A");
    const companyB = await makeCompany(ctx, "B");
    const adminA = await makeUser(ctx, { companyId: companyA, role: "admin" });
    const fieldA = await makeUser(ctx, { companyId: companyA, role: "field_user" });
    const adminB = await makeUser(ctx, { companyId: companyB, role: "admin" });
    const marketId = await makeMarket(ctx, { companyId: companyA });
    await insertAction(ctx, { marketId, userId: adminA, type: "visit", result: "success", resultingStatus: "gruen" });
    await ctx.pool.query("INSERT INTO note (market_id, user_id, content) VALUES ($1, $2, 'note')", [marketId, adminA]);
    await ctx.pool.query("INSERT INTO follow_up (market_id, user_id, due_at) VALUES ($1, $2, NOW())", [marketId, adminA]);
    await ctx.pool.query("INSERT INTO reservation (market_id, user_id, valid_until) VALUES ($1, $2, NOW() + INTERVAL '1 day')", [marketId, adminA]);

    await expect(permanentlyDeleteMarket(marketId, session(fieldA, companyA, "field_user"))).rejects.toMatchObject({ status: 403 } satisfies Partial<HttpError>);
    await expect(permanentlyDeleteMarket(marketId, session(adminB, companyB, "admin"))).rejects.toMatchObject({ status: 404 } satisfies Partial<HttpError>);
    await permanentlyDeleteMarket(marketId, session(adminA, companyA, "admin"));

    const { rows } = await ctx.pool.query<{ markets: string; actions: string; notes: string; followUps: string; reservations: string; audits: string }>(`
      SELECT
        (SELECT COUNT(*)::text FROM market WHERE id = $1::uuid) AS markets,
        (SELECT COUNT(*)::text FROM action WHERE market_id = $1::uuid) AS actions,
        (SELECT COUNT(*)::text FROM note WHERE market_id = $1::uuid) AS notes,
        (SELECT COUNT(*)::text FROM follow_up WHERE market_id = $1::uuid) AS "followUps",
        (SELECT COUNT(*)::text FROM reservation WHERE market_id = $1::uuid) AS reservations,
        (SELECT COUNT(*)::text FROM audit_log WHERE event = 'customer_deleted' AND payload->>'customer_id' = $1::text) AS audits
    `, [marketId]);
    expect(rows[0]).toEqual({ markets: "0", actions: "0", notes: "0", followUps: "0", reservations: "0", audits: "1" });
  });
});
