import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  makeCompany,
  makeUser,
  startTestDatabase,
  stopTestDatabase,
  truncateUserData,
  type TestContext,
} from "../helpers/db";

describe("field interactions", () => {
  let ctx: TestContext;

  beforeAll(async () => { ctx = await startTestDatabase(); }, 180_000);
  afterAll(async () => { if (ctx) await stopTestDatabase(ctx); });
  beforeEach(async () => { await truncateUserData(ctx); });

  it("stores a contact and linked note for a Google Places market without GLN or chain", async () => {
    const companyId = await makeCompany(ctx);
    const userId = await makeUser(ctx, { companyId, name: "Fikret" });
    const market = await ctx.pool.query<{ id: string }>(
      `INSERT INTO market (company_id, name, street_full, lat, lng, external_id)
       VALUES ($1, 'Google Markt', 'Musterstraße 1', 52.52, 13.405, 'place-1')
       RETURNING id`,
      [companyId],
    );
    const marketId = market.rows[0]!.id;
    const action = await ctx.pool.query<{ id: string }>(
      `INSERT INTO action (market_id, user_id, type, contact_type, result, resulting_status)
       VALUES ($1, $2, 'visit', 'phone', 'success', 'gelb') RETURNING id`,
      [marketId, userId],
    );
    await ctx.pool.query(
      "INSERT INTO note (market_id, action_id, user_id, content) VALUES ($1, $2, $3, $4)",
      [marketId, action.rows[0]!.id, userId, "Erneut nächste Woche sprechen."],
    );

    const { rows } = await ctx.pool.query<{ contact_type: string; content: string }>(
      `SELECT a.contact_type, n.content
       FROM action a LEFT JOIN note n ON n.action_id = a.id
       WHERE a.market_id = $1`,
      [marketId],
    );
    expect(rows).toEqual([{ contact_type: "phone", content: "Erneut nächste Woche sprechen." }]);
  });

  it("does not expose another tenant's interaction through a market-scoped query", async () => {
    const companyA = await makeCompany(ctx, "A");
    const companyB = await makeCompany(ctx, "B");
    const userB = await makeUser(ctx, { companyId: companyB });
    const market = await ctx.pool.query<{ id: string }>(
      `INSERT INTO market (company_id, name, street_full, lat, lng)
       VALUES ($1, 'Privat', 'Straße 1', 52.52, 13.405) RETURNING id`,
      [companyB],
    );
    await ctx.pool.query(
      `INSERT INTO action (market_id, user_id, type, contact_type, result, resulting_status)
       VALUES ($1, $2, 'visit', 'visit', 'success', 'gelb')`,
      [market.rows[0]!.id, userB],
    );

    const { rows } = await ctx.pool.query(
      `SELECT a.id FROM action a INNER JOIN market m ON m.id = a.market_id
       WHERE a.market_id = $1 AND m.company_id = $2`,
      [market.rows[0]!.id, companyA],
    );
    expect(rows).toHaveLength(0);
  });
});
