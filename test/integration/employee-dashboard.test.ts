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
import { getEmployeeTodayDashboard } from "@/lib/dashboard/today";
import { insertAction } from "@/lib/actions/insert";
import { updateMarket } from "@/lib/markets/crud";
import { getMarketDetail } from "@/lib/markets/repo";
import { type SessionUser } from "@/lib/http/errors";

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

describe("Sprint 007 — Employee Dashboard Integration Suite", () => {
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

  // 1. Dashboard only counts customers assigned to current employee & excludes another employee's customers
  it("only counts customers assigned to the current employee in the summary and pipeline", async () => {
    const companyId = await makeCompany(ctx);
    const aliceId = await makeUser(ctx, { companyId, name: "Alice" });
    const bobId = await makeUser(ctx, { companyId, name: "Bob" });
    const aliceUser = makeSessionUser({ id: aliceId, companyId });
    const bobUser = makeSessionUser({ id: bobId, companyId });

    // 2 markets assigned to Alice
    await makeMarket(ctx, { companyId, name: "Alice Market 1", assignedUserId: aliceId });
    const mAlice2 = await makeMarket(ctx, { companyId, name: "Alice Market 2", assignedUserId: aliceId });

    // 1 market assigned to Bob
    const mBob = await makeMarket(ctx, { companyId, name: "Bob Market", assignedUserId: bobId });

    // 1 unassigned market
    await makeMarket(ctx, { companyId, name: "Unassigned Market", assignedUserId: null });

    // Canonical stage transition: mAlice2 -> kontaktiert, mBob -> interesse
    await insertAction(
      { marketId: mAlice2, type: "visit", contactType: "phone", result: "success", salesStage: "kontaktiert" },
      aliceUser,
    );
    await insertAction(
      { marketId: mBob, type: "visit", contactType: "visit", result: "success", salesStage: "interesse" },
      bobUser,
    );

    const aliceDashboard = await getEmployeeTodayDashboard(companyId, aliceId);
    expect(aliceDashboard.summary.assignedCustomers).toBe(2);
    expect(aliceDashboard.pipeline.neu).toBe(1);
    expect(aliceDashboard.pipeline.kontaktiert).toBe(1);
    expect(aliceDashboard.pipeline.interesse).toBe(0);

    const bobDashboard = await getEmployeeTodayDashboard(companyId, bobId);
    expect(bobDashboard.summary.assignedCustomers).toBe(1);
    expect(bobDashboard.pipeline.interesse).toBe(1);
    expect(bobDashboard.pipeline.neu).toBe(0);
  });

  // 2. Tenant isolation
  it("completely excludes data from other tenants", async () => {
    const companyA = await makeCompany(ctx);
    const companyB = await makeCompany(ctx);

    const userA = await makeUser(ctx, { companyId: companyA, name: "User A" });
    const userB = await makeUser(ctx, { companyId: companyB, name: "User B" });
    const repB = makeSessionUser({ id: userB, companyId: companyB });

    // Market in company B, transitioned to angebot
    const mB = await makeMarket(ctx, { companyId: companyB, name: "Company B Market", assignedUserId: userB });
    await insertAction(
      { marketId: mB, type: "visit", contactType: "visit", result: "success", salesStage: "angebot" },
      repB,
    );

    // Dashboard for user A in company A
    const dashA = await getEmployeeTodayDashboard(companyA, userA);
    expect(dashA.summary.assignedCustomers).toBe(0);
    expect(dashA.pipeline.angebot).toBe(0);
    expect(dashA.overdueFollowUps).toHaveLength(0);
    expect(dashA.dueTodayFollowUps).toHaveLength(0);
  });

  // 3, 4, 5, 6. Overdue follow-ups, Due-today follow-ups, and future follow-ups
  it("classifies follow-ups correctly into overdue, today, and future", async () => {
    const companyId = await makeCompany(ctx);
    const repId = await makeUser(ctx, { companyId, name: "Rep 1" });
    const repUser = makeSessionUser({ id: repId, companyId });

    const marketOverdue = await makeMarket(ctx, { companyId, name: "Overdue Bakery", assignedUserId: repId, district: "Neukölln" });
    const marketToday = await makeMarket(ctx, { companyId, name: "Today Restaurant", assignedUserId: repId, district: "Mitte" });
    const marketFuture = await makeMarket(ctx, { companyId, name: "Future Café", assignedUserId: repId });

    // Set stages canonically via insertAction
    await insertAction(
      { marketId: marketOverdue, type: "visit", contactType: "visit", result: "success", salesStage: "interesse" },
      repUser,
    );
    await insertAction(
      { marketId: marketToday, type: "visit", contactType: "phone", result: "success", salesStage: "angebot" },
      repUser,
    );
    await insertAction(
      { marketId: marketFuture, type: "visit", contactType: "phone", result: "success", salesStage: "kontaktiert" },
      repUser,
    );

    const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
    const todayDate = new Date(); // now
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // in 7 days

    // Insert follow-ups directly
    await ctx.pool.query(
      `INSERT INTO follow_up (market_id, user_id, due_at, status, created_by_user_id)
       VALUES ($1, $2, $3, 'open', $2)`,
      [marketOverdue, repId, pastDate],
    );
    await ctx.pool.query(
      `INSERT INTO follow_up (market_id, user_id, due_at, status, created_by_user_id)
       VALUES ($1, $2, $3, 'open', $2)`,
      [marketToday, repId, todayDate],
    );
    await ctx.pool.query(
      `INSERT INTO follow_up (market_id, user_id, due_at, status, created_by_user_id)
       VALUES ($1, $2, $3, 'open', $2)`,
      [marketFuture, repId, futureDate],
    );

    const dashboard = await getEmployeeTodayDashboard(companyId, repId);

    // Summary counts
    expect(dashboard.summary.overdueFollowUps).toBe(1);
    expect(dashboard.summary.dueTodayFollowUps).toBe(1);

    // Overdue list
    expect(dashboard.overdueFollowUps).toHaveLength(1);
    expect(dashboard.overdueFollowUps[0]!.marketName).toBe("Overdue Bakery");
    expect(dashboard.overdueFollowUps[0]!.salesStage).toBe("interesse");
    expect(dashboard.overdueFollowUps[0]!.district).toBe("Neukölln");
    expect(dashboard.overdueFollowUps[0]!.overdueDays).toBeGreaterThanOrEqual(2);
    expect(dashboard.overdueFollowUps[0]!.label).toContain("Überfällig");

    // Today list
    expect(dashboard.dueTodayFollowUps).toHaveLength(1);
    expect(dashboard.dueTodayFollowUps[0]!.marketName).toBe("Today Restaurant");
    expect(dashboard.dueTodayFollowUps[0]!.salesStage).toBe("angebot");
    expect(dashboard.dueTodayFollowUps[0]!.district).toBe("Mitte");
    expect(dashboard.dueTodayFollowUps[0]!.label).toBe("Heute fällig");

    // Future follow-up is excluded from both
    const allListedIds = [
      ...dashboard.overdueFollowUps.map((f) => f.marketId),
      ...dashboard.dueTodayFollowUps.map((f) => f.marketId),
    ];
    expect(allListedIds).not.toContain(marketFuture);
  });

  // 7, 8, 9. High-priority customer listing, no-contact exclusion, and won/lost exclusion
  it("identifies high-interest customers as priority and excludes no_contact or won/lost customers", async () => {
    const companyId = await makeCompany(ctx);
    const repId = await makeUser(ctx, { companyId, name: "Sales Star" });
    const repUser = makeSessionUser({ id: repId, companyId });

    // Market 1: assigned, interest hoch -> should be high priority
    const mHigh = await makeMarket(ctx, { companyId, name: "High Interest Kiosk", assignedUserId: repId });
    await insertAction(
      { marketId: mHigh, type: "visit", contactType: "visit", result: "success", interestLevel: "hoch" },
      repUser,
    );

    // Market 2: assigned, interest mittel -> NOT high priority
    const mMid = await makeMarket(ctx, { companyId, name: "Medium Interest Shop", assignedUserId: repId });
    await insertAction(
      { marketId: mMid, type: "visit", contactType: "visit", result: "success", interestLevel: "mittel" },
      repUser,
    );

    // Market 3: assigned, interest hoch, but marked never_contact -> MUST BE EXCLUDED
    const mNoContact = await makeMarket(ctx, { companyId, name: "No Contact Market", assignedUserId: repId });
    await insertAction(
      {
        marketId: mNoContact,
        type: "visit",
        contactType: "visit",
        result: "no_contact",
        followUpType: "never_contact",
        interestLevel: "hoch",
      },
      repUser,
    );

    // Market 4: assigned, interest hoch, but stage = gewonnen -> MUST BE EXCLUDED
    const mWon = await makeMarket(ctx, { companyId, name: "Already Won Customer", assignedUserId: repId });
    await insertAction(
      {
        marketId: mWon,
        type: "visit",
        contactType: "visit",
        result: "success",
        interestLevel: "hoch",
        salesStage: "gewonnen",
        salesValue: 1000,
      },
      repUser,
    );

    const dashboard = await getEmployeeTodayDashboard(companyId, repId);

    expect(dashboard.summary.highPriorityCustomers).toBe(1);
    expect(dashboard.highPriorityCustomers).toHaveLength(1);
    expect(dashboard.highPriorityCustomers[0]!.id).toBe(mHigh);
    expect(dashboard.highPriorityCustomers[0]!.name).toBe("High Interest Kiosk");
    expect(dashboard.highPriorityCustomers[0]!.interestLevel).toBe("hoch");
  });

  // 10, 11, 12. Weekly activity metrics scoped to user and actual event types/timestamps
  it("aggregates weekly activity correctly for current user and differentiates contact types and stage wins", async () => {
    const companyId = await makeCompany(ctx);
    const userA = await makeUser(ctx, { companyId, name: "User A" });
    const userB = await makeUser(ctx, { companyId, name: "User B" });
    const repA = makeSessionUser({ id: userA, companyId });
    const repB = makeSessionUser({ id: userB, companyId });

    // Use separate markets for each activity to represent different customer visits/calls
    const marketA1 = await makeMarket(ctx, { companyId, name: "Activity Market A1", assignedUserId: userA });
    const marketA2 = await makeMarket(ctx, { companyId, name: "Activity Market A2", assignedUserId: userA });
    const marketB1 = await makeMarket(ctx, { companyId, name: "Activity Market B1", assignedUserId: userB });

    // User A: 1 visit on marketA1
    await insertAction(
      { marketId: marketA1, type: "visit", contactType: "visit", result: "success" },
      repA,
    );
    // User A: 1 phone call transitioning to gewonnen on marketA2
    await insertAction(
      { marketId: marketA2, type: "visit", contactType: "phone", result: "success", salesStage: "gewonnen", salesValue: 500 },
      repA,
    );

    // User B: 1 visit on marketB1
    await insertAction(
      { marketId: marketB1, type: "visit", contactType: "visit", result: "success" },
      repB,
    );

    const dashA = await getEmployeeTodayDashboard(companyId, userA);
    expect(dashA.weeklyActivity.contacts).toBe(2);
    expect(dashA.weeklyActivity.visits).toBe(1);
    expect(dashA.weeklyActivity.phoneCalls).toBe(1);
    expect(dashA.weeklyActivity.wins).toBe(1);

    const dashB = await getEmployeeTodayDashboard(companyId, userB);
    expect(dashB.weeklyActivity.contacts).toBe(1);
    expect(dashB.weeklyActivity.visits).toBe(1);
    expect(dashB.weeklyActivity.phoneCalls).toBe(0);
    expect(dashB.weeklyActivity.wins).toBe(0);
  });

  // 13. Empty dashboard returns zero counts and empty lists without errors
  it("returns zeros and empty arrays for a brand new user with no assigned markets or activity", async () => {
    const companyId = await makeCompany(ctx);
    const newUserId = await makeUser(ctx, { companyId, name: "Fresh Employee" });

    const dash = await getEmployeeTodayDashboard(companyId, newUserId);
    expect(dash.summary.assignedCustomers).toBe(0);
    expect(dash.summary.overdueFollowUps).toBe(0);
    expect(dash.summary.dueTodayFollowUps).toBe(0);
    expect(dash.summary.highPriorityCustomers).toBe(0);
    expect(dash.overdueFollowUps).toEqual([]);
    expect(dash.dueTodayFollowUps).toEqual([]);
    expect(dash.highPriorityCustomers).toEqual([]);
    expect(dash.pipeline).toEqual({
      neu: 0,
      kontaktiert: 0,
      interesse: 0,
      angebot: 0,
      gewonnen: 0,
      verloren: 0,
    });
    expect(dash.weeklyActivity).toEqual({
      contacts: 0,
      visits: 0,
      phoneCalls: 0,
      emails: 0,
      offers: 0,
      wins: 0,
    });
  });

  // 14, 15, 16. Admin assignment quick-edit, non-admin rejection, tenant isolation
  it("allows admin to assign/unassign customer, rejects non-admin, and preserves tenant isolation", async () => {
    const companyA = await makeCompany(ctx);
    const companyB = await makeCompany(ctx);

    const adminA = await makeUser(ctx, { companyId: companyA, role: "admin", name: "Admin A" });
    const repA = await makeUser(ctx, { companyId: companyA, role: "field_user", name: "Rep A" });
    const repB = await makeUser(ctx, { companyId: companyB, role: "field_user", name: "Rep B" });

    const adminSession = makeSessionUser({ id: adminA, companyId: companyA, role: "admin" });
    const fieldSession = makeSessionUser({ id: repA, companyId: companyA, role: "field_user" });

    const marketA = await makeMarket(ctx, { companyId: companyA, name: "Quick Edit Market" });

    // 14. Admin assignment quick-edit persists correctly
    await updateMarket(marketA, { assignedUserId: repA }, adminSession);
    const detailAfterAssign = await getMarketDetail(companyA, marketA);
    expect(detailAfterAssign.kind).toBe("ok");
    if (detailAfterAssign.kind === "ok") {
      expect(detailAfterAssign.market.assignedUserId).toBe(repA);
    }

    // 15. Non-admin assignment mutation is rejected with 403
    await expect(
      updateMarket(marketA, { assignedUserId: adminA }, fieldSession),
    ).rejects.toThrowError(
      expect.objectContaining({ status: 403, code: "ADMIN_ONLY" }),
    );

    // 16. Tenant isolation: Admin A cannot assign a user from company B
    await expect(
      updateMarket(marketA, { assignedUserId: repB }, adminSession),
    ).rejects.toThrowError(
      expect.objectContaining({ status: 400, code: "INVALID_ASSIGNED_USER" }),
    );
  });
});
