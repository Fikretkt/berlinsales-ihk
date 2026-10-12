import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeCompany,
  makeUser,
  startTestDatabase,
  stopTestDatabase,
  truncateUserData,
  type TestContext,
} from "../helpers/db";

// Mock next/headers and auth for the integration test
const mockAuth = vi.fn();
const mockHeaders = vi.fn();

vi.mock("@/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

import { getSessionUser } from "@/lib/auth/session";

describe("Integration: Session hardening and DB revalidation", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await startTestDatabase();
  });
  afterAll(async () => {
    if (ctx) await stopTestDatabase(ctx);
  });
  beforeEach(async () => {
    await truncateUserData(ctx);
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
  });

  it("revalidates an active user successfully against PostgreSQL", async () => {
    const companyId = await makeCompany(ctx, "Test Corp");
    const userId = await makeUser(ctx, {
      companyId,
      email: "active@testcorp.com",
      name: "Active Agent",
      role: "field_user",
      active: true,
    });

    mockAuth.mockResolvedValue({
      user: { id: userId },
    });

    const sessionUser = await getSessionUser();
    expect(sessionUser).not.toBeNull();
    expect(sessionUser?.id).toBe(userId);
    expect(sessionUser?.email).toBe("active@testcorp.com");
    expect(sessionUser?.companyId).toBe(companyId);
    expect(sessionUser?.role).toBe("field_user");
  });

  it("rejects a deactivated user (active: false in DB)", async () => {
    const companyId = await makeCompany(ctx, "Test Corp");
    const userId = await makeUser(ctx, {
      companyId,
      email: "disabled@testcorp.com",
      name: "Deactivated Agent",
      active: false,
    });

    mockAuth.mockResolvedValue({
      user: { id: userId },
    });

    const sessionUser = await getSessionUser();
    expect(sessionUser).toBeNull();
  });

  it("rejects a non-existent/deleted user (stale JWT with deleted ID)", async () => {
    const nonExistentUserId = "99999999-9999-4999-8999-999999999999";
    mockAuth.mockResolvedValue({
      user: { id: nonExistentUserId },
    });

    const sessionUser = await getSessionUser();
    expect(sessionUser).toBeNull();
  });

  it("rejects a user whose tenant/company was removed", async () => {
    const companyId = await makeCompany(ctx, "Temporary Corp");
    const userId = await makeUser(ctx, {
      companyId,
      email: "orphan@testcorp.com",
      active: true,
    });

    // Remove foreign key check temporarily to simulate an invalid/deleted company reference
    await ctx.pool.query("ALTER TABLE \"user\" DROP CONSTRAINT IF EXISTS user_company_id_company_id_fk");
    await ctx.pool.query("DELETE FROM company WHERE id = $1", [companyId]);

    mockAuth.mockResolvedValue({
      user: { id: userId },
    });

    const sessionUser = await getSessionUser();
    expect(sessionUser).toBeNull();

    // Restore constraint
    await ctx.pool.query(
      "ALTER TABLE \"user\" ADD CONSTRAINT user_company_id_company_id_fk FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE RESTRICT"
    ).catch(() => {});
  });
});
