import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  makeCompany,
  makeUser,
  startTestDatabase,
  stopTestDatabase,
  truncateUserData,
  type TestContext,
} from "../helpers/db";
import { insertAction } from "@/lib/actions/insert";
import { getMarketDetail } from "@/lib/markets/repo";
import { HttpError, type SessionUser } from "@/lib/http/errors";

function makeSessionUser(opts: {
  id: string;
  companyId: string;
  role?: "field_user" | "admin";
  name?: string;
  email?: string;
}): SessionUser {
  return {
    id: opts.id,
    companyId: opts.companyId,
    role: opts.role ?? "field_user",
    email: opts.email ?? `user-${opts.id.slice(0, 8)}@example.com`,
    name: opts.name ?? "Test User",
  };
}

describe("Sprint 005 — Sales Core integration tests", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    if (ctx) await stopTestDatabase(ctx);
  });

  beforeEach(async () => {
    await truncateUserData(ctx);
  });

  // 1. Same-company interaction can store structured feedback
  it("stores structured feedback (interest level and main reason) with interaction", async () => {
    const companyId = await makeCompany(ctx);
    const userId = await makeUser(ctx, { companyId, name: "Field Rep" });
    const market = await ctx.pool.query<{ id: string }>(
      `INSERT INTO market (company_id, name, street_full, lat, lng)
       VALUES ($1, 'Markt Structured Feedback', 'Teststraße 10', 52.52, 13.405)
       RETURNING id`,
      [companyId],
    );
    const marketId = market.rows[0]!.id;

    const result = await insertAction(
      {
        marketId,
        type: "visit",
        contactType: "visit",
        result: "success",
        interestLevel: "hoch",
        feedbackReason: "preis",
        note: "Kunde möchte Preisvergleich.",
      },
      makeSessionUser({ id: userId, companyId, role: "field_user", name: "Field Rep" }),
    );

    expect(result.actionId).toBeDefined();

    const { rows } = await ctx.pool.query<{
      interest_level: string;
      feedback_reason: string;
      note_content: string;
    }>(
      `SELECT a.interest_level, a.feedback_reason, n.content AS note_content
       FROM action a
       LEFT JOIN note n ON n.action_id = a.id
       WHERE a.id = $1`,
      [result.actionId],
    );

    expect(rows).toEqual([
      {
        interest_level: "hoch",
        feedback_reason: "preis",
        note_content: "Kunde möchte Preisvergleich.",
      },
    ]);
  });

  // 2. Sales stage updates correctly
  it("updates sales stage during customer interaction and reflects in market detail", async () => {
    const companyId = await makeCompany(ctx);
    const userId = await makeUser(ctx, { companyId });
    const market = await ctx.pool.query<{ id: string }>(
      `INSERT INTO market (company_id, name, street_full, lat, lng, sales_stage)
       VALUES ($1, 'Markt Pipeline', 'Pipelineweg 1', 52.52, 13.405, 'neu')
       RETURNING id`,
      [companyId],
    );
    const marketId = market.rows[0]!.id;

    const res = await insertAction(
      {
        marketId,
        type: "visit",
        contactType: "phone",
        result: "escalation",
        salesStage: "interesse",
      },
      makeSessionUser({ id: userId, companyId, role: "field_user" }),
    );

    expect(res.salesStage).toBe("interesse");

    const detailRes = await getMarketDetail(companyId, marketId);
    expect(detailRes.kind).toBe("ok");
    if (detailRes.kind === "ok") {
      expect(detailRes.market.salesStage).toBe("interesse");
    }
  });

  // 3. Gewonnen may store optional sales value
  it("stores optional sales value when stage is Gewonnen", async () => {
    const companyId = await makeCompany(ctx);
    const userId = await makeUser(ctx, { companyId });
    const market = await ctx.pool.query<{ id: string }>(
      `INSERT INTO market (company_id, name, street_full, lat, lng)
       VALUES ($1, 'Markt Gewonnen', 'Erfolgstr. 5', 52.52, 13.405)
       RETURNING id`,
      [companyId],
    );
    const marketId = market.rows[0]!.id;

    await insertAction(
      {
        marketId,
        type: "visit",
        contactType: "visit",
        result: "success",
        salesStage: "gewonnen",
        salesValue: 1250.5,
      },
      makeSessionUser({ id: userId, companyId, role: "field_user" }),
    );

    const detailRes = await getMarketDetail(companyId, marketId);
    expect(detailRes.kind).toBe("ok");
    if (detailRes.kind === "ok") {
      expect(detailRes.market.salesStage).toBe("gewonnen");
      expect(detailRes.market.salesValue).toBe(1250.5);
    }
  });

  // 4. Follow-up In 1 Woche
  it("creates a follow-up for In 1 Woche (+7 days)", async () => {
    const companyId = await makeCompany(ctx);
    const userId = await makeUser(ctx, { companyId, name: "Max" });
    const market = await ctx.pool.query<{ id: string }>(
      `INSERT INTO market (company_id, name, street_full, lat, lng)
       VALUES ($1, 'Markt 1W', 'Wochenstr. 7', 52.52, 13.405)
       RETURNING id`,
      [companyId],
    );
    const marketId = market.rows[0]!.id;

    const before = new Date();
    const res = await insertAction(
      {
        marketId,
        type: "visit",
        contactType: "phone",
        result: "escalation",
        followUpType: "1w",
      },
      makeSessionUser({ id: userId, companyId, role: "field_user", name: "Max" }),
    );

    expect(res.followUpDueAt).toBeInstanceOf(Date);
    const diffDays = Math.round(
      (res.followUpDueAt!.getTime() - before.getTime()) / (1000 * 60 * 60 * 24),
    );
    expect(diffDays).toBe(7);

    const detail = await getMarketDetail(companyId, marketId);
    expect(detail.kind).toBe("ok");
    if (detail.kind === "ok") {
      expect(detail.market.nextFollowUp).not.toBeNull();
      expect(detail.market.nextFollowUp?.userName).toBe("Max");
    }
  });

  // 5. Follow-up In 1 Monat
  it("creates a follow-up for In 1 Monat (+1 calendar month)", async () => {
    const companyId = await makeCompany(ctx);
    const userId = await makeUser(ctx, { companyId });
    const market = await ctx.pool.query<{ id: string }>(
      `INSERT INTO market (company_id, name, street_full, lat, lng)
       VALUES ($1, 'Markt 1M', 'Monatstr. 1', 52.52, 13.405)
       RETURNING id`,
      [companyId],
    );
    const marketId = market.rows[0]!.id;

    const res = await insertAction(
      {
        marketId,
        type: "visit",
        contactType: "email",
        result: "success",
        followUpType: "1m",
      },
      makeSessionUser({ id: userId, companyId, role: "field_user" }),
    );

    expect(res.followUpDueAt).toBeInstanceOf(Date);
    const now = new Date();
    const expectedMonth = (now.getMonth() + 1) % 12;
    expect(res.followUpDueAt!.getMonth()).toBe(expectedMonth);
  });

  // 6. Follow-up In 3 Monaten
  it("creates a follow-up for In 3 Monaten (+3 calendar months)", async () => {
    const companyId = await makeCompany(ctx);
    const userId = await makeUser(ctx, { companyId });
    const market = await ctx.pool.query<{ id: string }>(
      `INSERT INTO market (company_id, name, street_full, lat, lng)
       VALUES ($1, 'Markt 3M', 'Quartalstr. 3', 52.52, 13.405)
       RETURNING id`,
      [companyId],
    );
    const marketId = market.rows[0]!.id;

    const res = await insertAction(
      {
        marketId,
        type: "visit",
        contactType: "other",
        result: "escalation",
        followUpType: "3m",
      },
      makeSessionUser({ id: userId, companyId, role: "field_user" }),
    );

    expect(res.followUpDueAt).toBeInstanceOf(Date);
    const now = new Date();
    const expectedMonth = (now.getMonth() + 3) % 12;
    expect(res.followUpDueAt!.getMonth()).toBe(expectedMonth);
  });

  // 7. Custom follow-up date
  it("creates a follow-up with a custom selected date", async () => {
    const companyId = await makeCompany(ctx);
    const userId = await makeUser(ctx, { companyId });
    const market = await ctx.pool.query<{ id: string }>(
      `INSERT INTO market (company_id, name, street_full, lat, lng)
       VALUES ($1, 'Markt Custom', 'Wunschstr. 15', 52.52, 13.405)
       RETURNING id`,
      [companyId],
    );
    const marketId = market.rows[0]!.id;

    const targetDate = "2026-11-20";
    const res = await insertAction(
      {
        marketId,
        type: "visit",
        contactType: "phone",
        result: "success",
        followUpType: "custom",
        followUpDueAt: targetDate,
      },
      makeSessionUser({ id: userId, companyId, role: "field_user" }),
    );

    expect(res.followUpDueAt).toBeInstanceOf(Date);
    expect(res.followUpDueAt!.toISOString()).toContain("2026-11-20");
  });

  // 8. Replacing an existing open follow-up follows the chosen rule (One-Active-Rule)
  it("cancels previous open follow-up when a new follow-up is created", async () => {
    const companyId = await makeCompany(ctx);
    const userId = await makeUser(ctx, { companyId });
    const market = await ctx.pool.query<{ id: string }>(
      `INSERT INTO market (company_id, name, street_full, lat, lng)
       VALUES ($1, 'Markt Followup Replace', 'Ersatzstr. 2', 52.52, 13.405)
       RETURNING id`,
      [companyId],
    );
    const marketId = market.rows[0]!.id;

    // First follow-up (1 week)
    await insertAction(
      {
        marketId,
        type: "visit",
        contactType: "phone",
        result: "escalation",
        followUpType: "1w",
      },
      makeSessionUser({ id: userId, companyId, role: "field_user" }),
    );

    // Second follow-up (1 month) via profi_visit (valid follow-up on escalated market)
    await insertAction(
      {
        marketId,
        type: "profi_visit",
        contactType: "visit",
        result: "success",
        followUpType: "1m",
      },
      makeSessionUser({ id: userId, companyId, role: "field_user" }),
    );

    const { rows: openFollowUps } = await ctx.pool.query<{ id: string; status: string }>(
      `SELECT id, status FROM follow_up WHERE market_id = $1 AND status = 'open'`,
      [marketId],
    );

    // Only one open follow-up exists
    expect(openFollowUps).toHaveLength(1);

    const { rows: cancelledFollowUps } = await ctx.pool.query<{ id: string; status: string }>(
      `SELECT id, status FROM follow_up WHERE market_id = $1 AND status = 'cancelled'`,
      [marketId],
    );

    expect(cancelledFollowUps).toHaveLength(1);
  });

  // 9. Nie wieder kontaktieren prevents inappropriate new follow-up
  it("sets no_contact on market, cancels open follow-ups and prevents subsequent follow-ups", async () => {
    const companyId = await makeCompany(ctx);
    const userId = await makeUser(ctx, { companyId });
    const market = await ctx.pool.query<{ id: string }>(
      `INSERT INTO market (company_id, name, street_full, lat, lng)
       VALUES ($1, 'Markt Kein Kontakt', 'Verbotsweg 99', 52.52, 13.405)
       RETURNING id`,
      [companyId],
    );
    const marketId = market.rows[0]!.id;

    // First set a follow-up
    await insertAction(
      {
        marketId,
        type: "visit",
        contactType: "phone",
        result: "escalation",
        followUpType: "1w",
      },
      makeSessionUser({ id: userId, companyId, role: "field_user" }),
    );

    // Now record interaction with "never_contact" via profi_visit (valid on Rosa)
    const neverRes = await insertAction(
      {
        marketId,
        type: "profi_visit",
        contactType: "visit",
        result: "declined",
        followUpType: "never_contact",
      },
      makeSessionUser({ id: userId, companyId, role: "field_user" }),
    );

    expect(neverRes.noContact).toBe(true);

    // Verify open follow-ups are cancelled
    const { rows: openFollowUps } = await ctx.pool.query(
      `SELECT id FROM follow_up WHERE market_id = $1 AND status = 'open'`,
      [marketId],
    );
    expect(openFollowUps).toHaveLength(0);

    // Verify market detail shows noContact = true
    const detail = await getMarketDetail(companyId, marketId);
    expect(detail.kind).toBe("ok");
    if (detail.kind === "ok") {
      expect(detail.market.noContact).toBe(true);
      expect(detail.market.nextFollowUp).toBeNull();
    }

    // Trying to schedule a new follow-up on this no-contact market must be rejected
    await expect(
      insertAction(
        {
          marketId,
          type: "visit",
          contactType: "phone",
          result: "success",
          followUpType: "1w",
        },
        makeSessionUser({ id: userId, companyId, role: "field_user" }),
      ),
    ).rejects.toThrow(HttpError);
  });

  // 10. Cross-tenant mutation is rejected/not exposed
  it("rejects interaction mutation for another company market", async () => {
    const companyA = await makeCompany(ctx, "Tenant A");
    const companyB = await makeCompany(ctx, "Tenant B");
    const userA = await makeUser(ctx, { companyId: companyA });

    const marketB = await ctx.pool.query<{ id: string }>(
      `INSERT INTO market (company_id, name, street_full, lat, lng)
       VALUES ($1, 'Tenant B Market', 'Geheimstr. 1', 52.52, 13.405)
       RETURNING id`,
      [companyB],
    );
    const marketBId = marketB.rows[0]!.id;

    await expect(
      insertAction(
        {
          marketId: marketBId,
          type: "visit",
          contactType: "visit",
          result: "success",
          salesStage: "angebot",
          followUpType: "1w",
        },
        makeSessionUser({ id: userA, companyId: companyA, role: "field_user" }),
      ),
    ).rejects.toMatchObject({
      status: 404,
      code: "MARKET_NOT_FOUND",
    });
  });

  // 11. Google Places customer without GLN/chain works
  it("works seamlessly for Google Places customer without GLN or chain", async () => {
    const companyId = await makeCompany(ctx);
    const userId = await makeUser(ctx, { companyId });
    const market = await ctx.pool.query<{ id: string }>(
      `INSERT INTO market (company_id, name, street_full, lat, lng, external_id)
       VALUES ($1, 'Boutique Café', 'Kastanienallee 42', 52.535, 13.41, 'place-coffee-123')
       RETURNING id`,
      [companyId],
    );
    const marketId = market.rows[0]!.id;

    const res = await insertAction(
      {
        marketId,
        type: "visit",
        contactType: "visit",
        result: "success",
        interestLevel: "mittel",
        feedbackReason: "spaeter_kontaktieren",
        salesStage: "kontaktiert",
        followUpType: "1w",
        note: "Inhaberin war beschäftigt, nächste Woche wiederkommen.",
      },
      makeSessionUser({ id: userId, companyId, role: "field_user" }),
    );

    expect(res.actionId).toBeDefined();
    expect(res.salesStage).toBe("kontaktiert");
    expect(res.followUpDueAt).toBeInstanceOf(Date);

    const detail = await getMarketDetail(companyId, marketId);
    expect(detail.kind).toBe("ok");
    if (detail.kind === "ok") {
      expect(detail.market.gln).toBeNull();
      expect(detail.market.chain).toBeNull();
      expect(detail.market.salesStage).toBe("kontaktiert");
      expect(detail.market.nextFollowUp).not.toBeNull();
    }
  });
});
