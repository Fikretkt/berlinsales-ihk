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
import { createMarket, updateMarket } from "@/lib/markets/crud";
import { listMarkets, listMarketMapMarkers, getMarketDetail } from "@/lib/markets/repo";
import { AUDIT_EVENTS } from "@/lib/audit/events";
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

describe("Sprint 006 — Customer Assignment & Commercial Intelligence", () => {
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

  // 1. Default values for commercial intelligence and assignment
  it("defaults current_solution and satisfaction to 'unbekannt' and assigned_user_id to null", async () => {
    const companyId = await makeCompany(ctx);
    const adminId = await makeUser(ctx, { companyId, role: "admin" });
    const admin = makeSessionUser({ id: adminId, companyId, role: "admin" });

    const created = await createMarket(
      {
        name: "Bio Oase Berlin",
        streetFull: "Kantstraße 12",
        postalCode: "10623",
        city: "Berlin",
        lat: 52.506,
        lng: 13.315,
      },
      admin,
    );

    const detail = await getMarketDetail(companyId, created.marketId);
    expect(detail.kind).toBe("ok");
    if (detail.kind === "ok") {
      expect(detail.market.currentSolution).toBe("unbekannt");
      expect(detail.market.satisfaction).toBe("unbekannt");
      expect(detail.market.assignedUserId).toBeNull();
      expect(detail.market.assignedUser).toBeNull();
    }
  });

  // 2. Admin can assign a same-company active employee
  it("allows admin to assign a same-company employee to a market and persists across queries", async () => {
    const companyId = await makeCompany(ctx);
    const adminId = await makeUser(ctx, { companyId, role: "admin", name: "Admin Boss" });
    const employeeId = await makeUser(ctx, { companyId, role: "field_user", name: "Max Mustermann" });
    const admin = makeSessionUser({ id: adminId, companyId, role: "admin" });

    const marketId = await makeMarket(ctx, {
      companyId,
      name: "Café Schönbrunn",
    });

    await updateMarket(
      marketId,
      {
        assignedUserId: employeeId,
      },
      admin,
    );

    // Verify in detail query
    const detail = await getMarketDetail(companyId, marketId);
    expect(detail.kind).toBe("ok");
    if (detail.kind === "ok") {
      expect(detail.market.assignedUserId).toBe(employeeId);
      expect(detail.market.assignedUser).not.toBeNull();
      expect(detail.market.assignedUser?.name).toBe("Max Mustermann");
    }

    // Verify in list query
    const list = await listMarkets(companyId, employeeId, {});
    const item = list.items.find((m) => m.id === marketId);
    expect(item).toBeDefined();
    expect(item?.assignedUserId).toBe(employeeId);
    expect(item?.assignedUserName).toBe("Max Mustermann");
  });

  // 3. Reject cross-company employee assignment
  it("rejects cross-company employee assignment with 400 INVALID_ASSIGNED_USER", async () => {
    const companyA = await makeCompany(ctx, "Company A");
    const companyB = await makeCompany(ctx, "Company B");

    const adminAId = await makeUser(ctx, { companyId: companyA, role: "admin" });
    const employeeBId = await makeUser(ctx, { companyId: companyB, role: "field_user" });
    const adminA = makeSessionUser({ id: adminAId, companyId: companyA, role: "admin" });

    const marketAId = await makeMarket(ctx, { companyId: companyA, name: "Market A" });

    await expect(
      updateMarket(marketAId, { assignedUserId: employeeBId }, adminA),
    ).rejects.toThrowError(
      expect.objectContaining({
        status: 400,
        code: "INVALID_ASSIGNED_USER",
      }),
    );
  });

  // 4. Non-admin cannot mutate assignment
  it("rejects non-admin assignment mutation with 403 ADMIN_ONLY", async () => {
    const companyId = await makeCompany(ctx);
    const fieldUserId = await makeUser(ctx, { companyId, role: "field_user" });
    const otherUserId = await makeUser(ctx, { companyId, role: "field_user" });
    const fieldUser = makeSessionUser({ id: fieldUserId, companyId, role: "field_user" });

    const marketId = await makeMarket(ctx, { companyId, name: "Test Kiosk" });

    await expect(
      updateMarket(marketId, { assignedUserId: otherUserId }, fieldUser),
    ).rejects.toThrowError(
      expect.objectContaining({
        status: 403,
        code: "ADMIN_ONLY",
      }),
    );
  });

  // 5. Admin can unassign a market
  it("allows admin to unassign a market by setting assignedUserId to null", async () => {
    const companyId = await makeCompany(ctx);
    const adminId = await makeUser(ctx, { companyId, role: "admin" });
    const repId = await makeUser(ctx, { companyId, role: "field_user" });
    const admin = makeSessionUser({ id: adminId, companyId, role: "admin" });

    const marketId = await makeMarket(ctx, {
      companyId,
      name: "Supermarkt Späti",
      assignedUserId: repId,
    });

    // Unassign
    await updateMarket(marketId, { assignedUserId: null }, admin);

    const detail = await getMarketDetail(companyId, marketId);
    expect(detail.kind).toBe("ok");
    if (detail.kind === "ok") {
      expect(detail.market.assignedUserId).toBeNull();
      expect(detail.market.assignedUser).toBeNull();
    }
  });

  // 6. Field user and admin can update commercial intelligence
  it("allows field users and admins to update current_solution and satisfaction", async () => {
    const companyId = await makeCompany(ctx);
    const repId = await makeUser(ctx, { companyId, role: "field_user" });
    const rep = makeSessionUser({ id: repId, companyId, role: "field_user" });

    const marketId = await makeMarket(ctx, { companyId, name: "Boutique Bella" });

    // Field user updates solution to 'sumup' and satisfaction to 'unzufrieden'
    await updateMarket(
      marketId,
      {
        currentSolution: "sumup",
        satisfaction: "unzufrieden",
      },
      rep,
    );

    const detail = await getMarketDetail(companyId, marketId);
    expect(detail.kind).toBe("ok");
    if (detail.kind === "ok") {
      expect(detail.market.currentSolution).toBe("sumup");
      expect(detail.market.satisfaction).toBe("unzufrieden");
    }
  });

  // 7. Consistency Amendment: assigned_to_me produces identical scope in list and map
  it("filters consistently with assignedToMe=true across both listMarkets and listMarketMapMarkers", async () => {
    const companyId = await makeCompany(ctx);
    const repAliceId = await makeUser(ctx, { companyId, name: "Alice Rep" });
    const repBobId = await makeUser(ctx, { companyId, name: "Bob Rep" });

    // Market 1 assigned to Alice
    const mAlice1 = await makeMarket(ctx, {
      companyId,
      name: "Alices Markt 1",
      assignedUserId: repAliceId,
    });
    // Market 2 assigned to Alice
    const mAlice2 = await makeMarket(ctx, {
      companyId,
      name: "Alices Markt 2",
      assignedUserId: repAliceId,
    });
    // Market 3 assigned to Bob
    const mBob = await makeMarket(ctx, {
      companyId,
      name: "Bobs Markt",
      assignedUserId: repBobId,
    });
    // Market 4 unassigned
    await makeMarket(ctx, {
      companyId,
      name: "Freier Markt",
      assignedUserId: null,
    });

    // 1. Check List for Alice
    const aliceList = await listMarkets(companyId, repAliceId, { assignedToMe: true });
    const aliceListIds = aliceList.items.map((m) => m.id).sort();

    // 2. Check Map for Alice
    const aliceMap = await listMarketMapMarkers(companyId, repAliceId, { assignedToMe: true });
    const aliceMapIds = aliceMap.map((m) => m.id).sort();

    // Identical scope!
    expect(aliceListIds).toEqual([mAlice1, mAlice2].sort());
    expect(aliceMapIds).toEqual([mAlice1, mAlice2].sort());
    expect(aliceListIds).toEqual(aliceMapIds);

    // Bob cannot see Alice's or unassigned markets when assignedToMe=true
    const bobList = await listMarkets(companyId, repBobId, { assignedToMe: true });
    const bobMap = await listMarketMapMarkers(companyId, repBobId, { assignedToMe: true });
    expect(bobList.items.map((m) => m.id)).toEqual([mBob]);
    expect(bobMap.map((m) => m.id)).toEqual([mBob]);
  });

  // 8. Audit logging amendment: reuses existing audit mechanism
  it("records AUDIT_EVENTS.MARKET_UPDATED with changed_fields in audit_log for assignment and intelligence mutations", async () => {
    const companyId = await makeCompany(ctx);
    const adminId = await makeUser(ctx, { companyId, role: "admin" });
    const employeeId = await makeUser(ctx, { companyId, role: "field_user" });
    const admin = makeSessionUser({ id: adminId, companyId, role: "admin" });

    const marketId = await makeMarket(ctx, { companyId, name: "Audit Test Market" });

    await updateMarket(
      marketId,
      {
        assignedUserId: employeeId,
        currentSolution: "verifone",
        satisfaction: "neutral",
      },
      admin,
    );

    const auditRows = await ctx.pool.query<{
      event: string;
      payload: { market_id: string; changed_fields: string[]; assigned_user_id?: string; current_solution?: string };
    }>(
      `SELECT event, payload FROM audit_log
       WHERE company_id = $1 AND event = $2
       ORDER BY created_at DESC LIMIT 1`,
      [companyId, AUDIT_EVENTS.MARKET_UPDATED],
    );

    expect(auditRows.rows.length).toBe(1);
    const log = auditRows.rows[0]!;
    expect(log.event).toBe(AUDIT_EVENTS.MARKET_UPDATED);
    expect(log.payload.market_id).toBe(marketId);
    expect(log.payload.changed_fields).toContain("assignedUserId");
    expect(log.payload.changed_fields).toContain("currentSolution");
    expect(log.payload.changed_fields).toContain("satisfaction");
    expect(log.payload.assigned_user_id).toBe(employeeId);
    expect(log.payload.current_solution).toBe("verifone");
  });

  // 9. Google Places compatibility (markets without chain / GLN)
  it("handles Google Places imported markets without chain or GLN gracefully", async () => {
    const companyId = await makeCompany(ctx);
    const adminId = await makeUser(ctx, { companyId, role: "admin" });
    const admin = makeSessionUser({ id: adminId, companyId, role: "admin" });

    // Google Places imported market: no chain, no GLN
    const marketId = await makeMarket(ctx, {
      companyId,
      chainId: null,
      gln: null,
      name: "Döner Treffpunkt (Google Places Import)",
    });

    await updateMarket(
      marketId,
      {
        currentSolution: "ingenico",
        satisfaction: "zufrieden",
      },
      admin,
    );

    const detail = await getMarketDetail(companyId, marketId);
    expect(detail.kind).toBe("ok");
    if (detail.kind === "ok") {
      expect(detail.market.chain).toBeNull();
      expect(detail.market.gln).toBeNull();
      expect(detail.market.currentSolution).toBe("ingenico");
      expect(detail.market.satisfaction).toBe("zufrieden");
    }
  });

  // 10. Tenant isolation
  it("prevents cross-tenant access to markets and assignment filters", async () => {
    const companyA = await makeCompany(ctx, "Tenant Alpha");
    const companyB = await makeCompany(ctx, "Tenant Beta");

    const userA = await makeUser(ctx, { companyId: companyA, name: "Alpha User" });
    const userB = await makeUser(ctx, { companyId: companyB, name: "Beta User" });

    const marketA = await makeMarket(ctx, {
      companyId: companyA,
      name: "Alpha Market",
      assignedUserId: userA,
    });

    // User B querying with assignedToMe=true in Company B gets 0 items
    const bList = await listMarkets(companyB, userB, { assignedToMe: true });
    expect(bList.items).toHaveLength(0);

    const bMap = await listMarketMapMarkers(companyB, userB, { assignedToMe: true });
    expect(bMap).toHaveLength(0);

    // User B cannot get detail of marketA
    const notFoundResult = await getMarketDetail(companyB, marketA);
    expect(notFoundResult.kind).toBe("not_found");
  });
});
