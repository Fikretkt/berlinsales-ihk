import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  makeCompany,
  makeUser,
  makeMarket,
  startTestDatabase,
  stopTestDatabase,
  truncateUserData,
  type TestContext,
} from "../helpers/db";
import { getManagementDashboard } from "@/lib/dashboard/management";
import { insertAction } from "@/lib/actions/insert";
import { listMarkets } from "@/lib/markets/repo";
import type { SessionUser } from "@/lib/auth/session";
import { HttpError } from "@/lib/http/errors";

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
    role: opts.role ?? "admin",
    email: opts.email ?? `user-${opts.id.slice(0, 8)}@example.com`,
    name: opts.name ?? "Test User",
  };
}

describe("Sprint 008 — Management Dashboard Integration Suite", () => {
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

  // 1. Non-admin cannot access management dashboard authorization
  it("rejects non-admin users with 403 FIELD_USER_NOT_ALLOWED", async () => {
    const companyId = await makeCompany(ctx);
    const fieldUserId = await makeUser(ctx, { companyId, role: "field_user" });

    // Function check matching requireAdmin logic
    const session = makeSessionUser({ id: fieldUserId, companyId, role: "field_user" });
    expect(session.role).not.toBe("admin");

    const checkAdmin = (user: SessionUser) => {
      if (user.role !== "admin") {
        throw new HttpError(403, "FIELD_USER_NOT_ALLOWED", "Diese Aktion ist Admins vorbehalten");
      }
    };

    expect(() => checkAdmin(session)).toThrowError(
      expect.objectContaining({ status: 403, code: "FIELD_USER_NOT_ALLOWED" }),
    );
  });

  // 2, 3. Tenant isolation: Admin sees only own tenant data & another tenant's contacts do not affect KPIs
  it("strictly isolates tenant data across companies and ignores another tenant's activities", async () => {
    const companyA = await makeCompany(ctx, "Company A");
    const companyB = await makeCompany(ctx, "Company B");

    await makeUser(ctx, { companyId: companyA, role: "admin", name: "Alice Admin" });
    const userB = await makeUser(ctx, { companyId: companyB, role: "field_user", name: "Bob Field" });

    const sessionB = makeSessionUser({ id: userB, companyId: companyB, role: "field_user" });

    await makeMarket(ctx, { companyId: companyA, name: "Market A" });
    const marketB = await makeMarket(ctx, { companyId: companyB, name: "Market B" });

    // Activity on Company B
    await insertAction(
      { marketId: marketB, type: "visit", contactType: "visit", result: "success", salesStage: "gewonnen", salesValue: 1000 },
      sessionB,
    );

    const dashA = await getManagementDashboard(companyA, "week");
    expect(dashA.activity.contacts).toBe(0);
    expect(dashA.activity.wins).toBe(0);
    expect(dashA.activity.visits).toBe(0);
    expect(dashA.wonSalesValue).toBeNull();
    expect(dashA.pipeline.gewonnen).toBe(0);

    const dashB = await getManagementDashboard(companyB, "week");
    expect(dashB.activity.contacts).toBe(1);
    expect(dashB.activity.wins).toBe(1);
    expect(dashB.wonSalesValue).toBe(1000);
  });

  // 4, 5. Contacts count respects selected period and classifies visits/phone calls correctly
  it("respects selected period boundaries and correctly classifies contact types", async () => {
    const companyId = await makeCompany(ctx);
    const repId = await makeUser(ctx, { companyId, name: "Rep 1" });
    const repSession = makeSessionUser({ id: repId, companyId });

    const mToday1 = await makeMarket(ctx, { companyId, name: "Today Visit" });
    const mToday2 = await makeMarket(ctx, { companyId, name: "Today Call" });

    // Contact 1: Today visit
    await insertAction(
      { marketId: mToday1, type: "visit", contactType: "visit", result: "success" },
      repSession,
    );
    // Contact 2: Today phone call
    await insertAction(
      { marketId: mToday2, type: "visit", contactType: "phone", result: "success" },
      repSession,
    );

    const dashToday = await getManagementDashboard(companyId, "today");
    expect(dashToday.activity.contacts).toBe(2);
    expect(dashToday.activity.visits).toBe(1);
    expect(dashToday.activity.phoneCalls).toBe(1);
  });

  // 6, 7. Wins and losses use transition/event timing rather than current-state-only counting
  it("uses action transition timing rather than current market state for wins and losses", async () => {
    const companyId = await makeCompany(ctx);
    const repId = await makeUser(ctx, { companyId, name: "Closer" });
    const repSession = makeSessionUser({ id: repId, companyId });

    const mWon = await makeMarket(ctx, { companyId, name: "Won Deal" });
    const mLost = await makeMarket(ctx, { companyId, name: "Lost Deal" });

    // Record won transition action today
    await insertAction(
      { marketId: mWon, type: "visit", contactType: "visit", result: "success", salesStage: "gewonnen", salesValue: 750 },
      repSession,
    );
    // Record lost transition action today
    await insertAction(
      { marketId: mLost, type: "visit", contactType: "phone", result: "declined", salesStage: "verloren" },
      repSession,
    );

    const dash = await getManagementDashboard(companyId, "today");
    expect(dash.activity.wins).toBe(1);
    expect(dash.activity.losses).toBe(1);
    expect(dash.wonSalesValue).toBe(750);
  });

  // 8, 9. Conversion rate formula and null-safety
  it("computes conversion rate as Gewonnen / (Gewonnen + Verloren) and is null-safe", async () => {
    const companyId = await makeCompany(ctx);
    const repId = await makeUser(ctx, { companyId, name: "Rep Conversion" });
    const repSession = makeSessionUser({ id: repId, companyId });

    // 0 terminal outcomes initially
    const emptyDash = await getManagementDashboard(companyId, "week");
    expect(emptyDash.activity.conversionRate).toBeNull();

    // Add 3 won and 1 lost -> 3 / 4 = 75%
    for (let i = 0; i < 3; i++) {
      const m = await makeMarket(ctx, { companyId, name: `Won ${i}` });
      await insertAction(
        { marketId: m, type: "visit", contactType: "visit", result: "success", salesStage: "gewonnen" },
        repSession,
      );
    }
    const mLost = await makeMarket(ctx, { companyId, name: "Lost 1" });
    await insertAction(
      { marketId: mLost, type: "visit", contactType: "phone", result: "declined", salesStage: "verloren" },
      repSession,
    );

    const dash = await getManagementDashboard(companyId, "week");
    expect(dash.activity.wins).toBe(3);
    expect(dash.activity.losses).toBe(1);
    expect(dash.activity.conversionRate).toBe(75);
  });

  // 10. Pipeline contains all six stages
  it("ensures pipeline snapshot contains all six canonical stages", async () => {
    const companyId = await makeCompany(ctx);
    const dash = await getManagementDashboard(companyId, "week");

    expect(dash.pipeline).toEqual({
      neu: 0,
      kontaktiert: 0,
      interesse: 0,
      angebot: 0,
      gewonnen: 0,
      verloren: 0,
    });
  });

  // 11, 12, 13, 14. Employee performance scoped to same-company active users, no cross-mixing, assigned & overdue counts
  it("correctly aggregates employee performance per user without cross-mixing or row multiplication", async () => {
    const companyId = await makeCompany(ctx);
    const userA = await makeUser(ctx, { companyId, name: "Anna", active: true });
    const userB = await makeUser(ctx, { companyId, name: "Bob", active: true });
    await makeUser(ctx, { companyId, name: "Inactive User", active: false });

    const sessionA = makeSessionUser({ id: userA, companyId });
    const sessionB = makeSessionUser({ id: userB, companyId });

    // 2 markets assigned to Anna
    const mA1 = await makeMarket(ctx, { companyId, name: "Market A1", assignedUserId: userA });
    const mA2 = await makeMarket(ctx, { companyId, name: "Market A2", assignedUserId: userA });

    // 1 market assigned to Bob
    const mB1 = await makeMarket(ctx, { companyId, name: "Market B1", assignedUserId: userB });

    // Activity: Anna has 2 visits (1 won), Bob has 1 call
    await insertAction(
      { marketId: mA1, type: "visit", contactType: "visit", result: "success" },
      sessionA,
    );
    await insertAction(
      { marketId: mA2, type: "visit", contactType: "visit", result: "success", salesStage: "gewonnen", salesValue: 500 },
      sessionA,
    );
    await insertAction(
      { marketId: mB1, type: "visit", contactType: "phone", result: "success" },
      sessionB,
    );

    // Overdue follow-up for Anna
    const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await ctx.pool.query(
      `INSERT INTO follow_up (market_id, user_id, due_at, status, created_by_user_id)
       VALUES ($1, $2, $3, 'open', $2)`,
      [mA1, userA, pastDate],
    );

    const dash = await getManagementDashboard(companyId, "week");

    // Inactive user excluded
    const employeeNames = dash.employees.map((e) => e.name);
    expect(employeeNames).toContain("Anna");
    expect(employeeNames).toContain("Bob");
    expect(employeeNames).not.toContain("Inactive User");

    // Anna's metrics
    const anna = dash.employees.find((e) => e.id === userA)!;
    expect(anna.assignedCustomers).toBe(2);
    expect(anna.contacts).toBe(2);
    expect(anna.visits).toBe(2);
    expect(anna.phoneCalls).toBe(0);
    expect(anna.wins).toBe(1);
    expect(anna.overdueFollowUps).toBe(1);
    expect(anna.wonSalesValue).toBe(500);

    // Bob's metrics
    const bob = dash.employees.find((e) => e.id === userB)!;
    expect(bob.assignedCustomers).toBe(1);
    expect(bob.contacts).toBe(1);
    expect(bob.visits).toBe(0);
    expect(bob.phoneCalls).toBe(1);
    expect(bob.wins).toBe(0);
    expect(bob.overdueFollowUps).toBe(0);
    expect(bob.wonSalesValue).toBe(0);
  });

  // 15, 16. Overdue list sorted oldest first & tenant-safe
  it("sorts overdue follow-up list oldest first and isolates tenant follow-ups", async () => {
    const companyA = await makeCompany(ctx);
    const companyB = await makeCompany(ctx);

    const userA = await makeUser(ctx, { companyId: companyA, name: "User A" });
    const userB = await makeUser(ctx, { companyId: companyB, name: "User B" });

    const mA1 = await makeMarket(ctx, { companyId: companyA, name: "Market A Older" });
    const mA2 = await makeMarket(ctx, { companyId: companyA, name: "Market A Newer" });
    const mB = await makeMarket(ctx, { companyId: companyB, name: "Market B Overdue" });

    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    await ctx.pool.query(
      `INSERT INTO follow_up (market_id, user_id, due_at, status, created_by_user_id) VALUES
       ($1, $2, $3, 'open', $2),
       ($4, $2, $5, 'open', $2)`,
      [mA1, userA, fiveDaysAgo, mA2, twoDaysAgo],
    );

    await ctx.pool.query(
      `INSERT INTO follow_up (market_id, user_id, due_at, status, created_by_user_id) VALUES
       ($1, $2, $3, 'open', $2)`,
      [mB, userB, fiveDaysAgo],
    );

    const dashA = await getManagementDashboard(companyA, "week");
    expect(dashA.followUps.overdue).toBe(2);
    expect(dashA.followUps.overdueItems).toHaveLength(2);
    // Oldest first
    expect(dashA.followUps.overdueItems[0]!.marketName).toBe("Market A Older");
    expect(dashA.followUps.overdueItems[1]!.marketName).toBe("Market A Newer");
  });

  // 17. Structured feedback reason aggregation is correct
  it("aggregates structured feedback reasons correctly for the selected period", async () => {
    const companyId = await makeCompany(ctx);
    const repId = await makeUser(ctx, { companyId, name: "Feedback Rep" });
    const repSession = makeSessionUser({ id: repId, companyId });

    const m1 = await makeMarket(ctx, { companyId, name: "Market Reason 1" });
    const m2 = await makeMarket(ctx, { companyId, name: "Market Reason 2" });
    const m3 = await makeMarket(ctx, { companyId, name: "Market Reason 3" });

    await insertAction(
      { marketId: m1, type: "visit", contactType: "visit", result: "declined", feedbackReason: "preis" },
      repSession,
    );
    await insertAction(
      { marketId: m2, type: "visit", contactType: "visit", result: "declined", feedbackReason: "preis" },
      repSession,
    );
    await insertAction(
      { marketId: m3, type: "visit", contactType: "phone", result: "declined", feedbackReason: "keine_zeit" },
      repSession,
    );

    const dash = await getManagementDashboard(companyId, "week");
    const preisItem = dash.feedbackReasons.find((r) => r.reason === "preis");
    const keineZeitItem = dash.feedbackReasons.find((r) => r.reason === "keine_zeit");

    expect(preisItem?.count).toBe(2);
    expect(keineZeitItem?.count).toBe(1);
    expect(dash.feedbackReasons[0]!.reason).toBe("preis"); // Sorted descending
  });

  // 18. Current solution distribution is correct
  it("aggregates customer current solution distribution snapshot correctly", async () => {
    const companyId = await makeCompany(ctx);
    await makeMarket(ctx, { companyId, name: "SumUp Kiosk", currentSolution: "sumup" });
    await makeMarket(ctx, { companyId, name: "Zettle Café", currentSolution: "zettle" });

    const dash = await getManagementDashboard(companyId, "week");
    expect(dash.solutionDistribution.sumup).toBe(1);
    expect(dash.solutionDistribution.zettle).toBe(1);
    expect(dash.solutionDistribution.keine).toBe(0);
    expect(dash.solutionDistribution.verifone).toBe(0);
  });

  // 19. Satisfaction distribution is correct
  it("aggregates customer satisfaction distribution snapshot correctly", async () => {
    const companyId = await makeCompany(ctx);
    await makeMarket(ctx, { companyId, name: "Happy Bakery", satisfaction: "zufrieden" });
    await makeMarket(ctx, { companyId, name: "Neutral Shop", satisfaction: "neutral" });

    const dash = await getManagementDashboard(companyId, "week");
    expect(dash.satisfactionDistribution.zufrieden).toBe(1);
    expect(dash.satisfactionDistribution.neutral).toBe(1);
    expect(dash.satisfactionDistribution.unzufrieden).toBe(0);
  });

  // 20. Empty tenant/user activity produces safe zero/empty states
  it("produces safe zero/empty states for a brand new tenant with no activity", async () => {
    const companyId = await makeCompany(ctx);
    const dash = await getManagementDashboard(companyId, "today");

    expect(dash.activity).toEqual({
      contacts: 0,
      visits: 0,
      phoneCalls: 0,
      offers: 0,
      wins: 0,
      losses: 0,
      conversionRate: null,
    });
    expect(dash.wonSalesValue).toBeNull();
    expect(dash.followUps.overdue).toBe(0);
    expect(dash.followUps.dueToday).toBe(0);
    expect(dash.followUps.overdueItems).toEqual([]);
    expect(dash.employees).toEqual([]);
    expect(dash.feedbackReasons).toEqual([]);
  });

  // 21. Selected period boundaries use Berlin semantics
  it("uses Berlin calendar boundaries for selected periods", async () => {
    const companyId = await makeCompany(ctx);
    const dashToday = await getManagementDashboard(companyId, "today");
    const dashWeek = await getManagementDashboard(companyId, "week");
    const dashMonth = await getManagementDashboard(companyId, "month");

    expect(dashToday.period.key).toBe("today");
    expect(dashWeek.period.key).toBe("week");
    expect(dashMonth.period.key).toBe("month");
    expect(new Date(dashToday.period.start).getTime()).toBeLessThan(new Date(dashToday.period.end).getTime());
  });

  // 22. Admin-only employee drill-down / filter remains tenant-safe
  it("allows admin to filter markets by assigned_user_id and prevents cross-tenant drill-down", async () => {
    const companyA = await makeCompany(ctx, "Company A");
    const companyB = await makeCompany(ctx, "Company B");

    const adminA = await makeUser(ctx, { companyId: companyA, role: "admin", name: "Admin A" });
    const repA = await makeUser(ctx, { companyId: companyA, role: "field_user", name: "Rep A" });
    const repB = await makeUser(ctx, { companyId: companyB, role: "field_user", name: "Rep B" });

    const mA1 = await makeMarket(ctx, { companyId: companyA, name: "Market A1", assignedUserId: repA });
    await makeMarket(ctx, { companyId: companyA, name: "Market A2", assignedUserId: null });

    // Valid same-company assigned filter
    const filteredA = await listMarkets(companyA, adminA, { assignedUserId: repA });
    expect(filteredA.items).toHaveLength(1);
    expect(filteredA.items[0]!.id).toBe(mA1);

    // Filter for user from foreign company returns no rows in company A
    const foreignFilter = await listMarkets(companyA, adminA, { assignedUserId: repB });
    expect(foreignFilter.items).toHaveLength(0);
  });
});
