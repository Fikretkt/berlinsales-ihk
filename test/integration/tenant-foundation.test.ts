import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getChainId,
  makeCompany,
  makeMarket,
  makeUser,
  startTestDatabase,
  stopTestDatabase,
  truncateUserData,
  type TestContext,
} from "../helpers/db";

describe("Sprint 3 tenant foundation", () => {
  let ctx: TestContext;

  beforeAll(async () => { ctx = await startTestDatabase(); });
  afterAll(async () => { if (ctx) await stopTestDatabase(ctx); });
  beforeEach(async () => { await truncateUserData(ctx); });

  it("owns markets by company and permits the same GLN in separate companies", async () => {
    const companyA = await makeCompany(ctx, "A");
    const companyB = await makeCompany(ctx, "B");
    const chainId = await getChainId(ctx);
    const gln = "4999999999999";
    const marketA = await makeMarket(ctx, { companyId: companyA, chainId, gln });
    const marketB = await makeMarket(ctx, { companyId: companyB, chainId, gln });

    const { rows } = await ctx.pool.query<{ id: string }>(
      "SELECT id FROM market WHERE company_id = $1 ORDER BY id",
      [companyA],
    );
    expect(rows.map((row) => row.id)).toEqual([marketA]);
    expect(marketB).not.toBe(marketA);
  });

  it("does not resolve another company market through a tenant-scoped child join", async () => {
    const companyA = await makeCompany(ctx, "A");
    const companyB = await makeCompany(ctx, "B");
    const userB = await makeUser(ctx, { companyId: companyB });
    const chainId = await getChainId(ctx);
    const marketB = await makeMarket(ctx, { companyId: companyB, chainId });
    await ctx.pool.query(
      `INSERT INTO note (market_id, user_id, content) VALUES ($1, $2, 'private')`,
      [marketB, userB],
    );

    const { rows } = await ctx.pool.query(
      `SELECT n.id FROM note n
       INNER JOIN market m ON m.id = n.market_id
       WHERE n.market_id = $1 AND m.company_id = $2`,
      [marketB, companyA],
    );
    expect(rows).toHaveLength(0);
  });

  it("keeps audit events tenant-owned", async () => {
    const companyA = await makeCompany(ctx, "A");
    const companyB = await makeCompany(ctx, "B");
    const userA = await makeUser(ctx, { companyId: companyA });
    await ctx.pool.query(
      `INSERT INTO audit_log (company_id, user_id, event, payload)
       VALUES ($1, $2, 'market_created', '{}'::jsonb)`,
      [companyA, userA],
    );

    const { rows } = await ctx.pool.query(
      "SELECT id FROM audit_log WHERE company_id = $1",
      [companyB],
    );
    expect(rows).toHaveLength(0);
  });
});
