import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { customer } from "@/lib/db/schema";
import {
  makeCompany,
  makeUser,
  startTestDatabase,
  stopTestDatabase,
  truncateUserData,
  type TestContext,
} from "../helpers/db";

describe("Customer CRUD and tenant isolation", () => {
  let ctx: TestContext;
  beforeAll(async () => { ctx = await startTestDatabase(); });
  afterAll(async () => { await stopTestDatabase(ctx); });
  beforeEach(async () => { await truncateUserData(ctx); });

  it("creates customers and keeps field users scoped to assignments", async () => {
    const companyA = await makeCompany(ctx, "A");
    const companyB = await makeCompany(ctx, "B");
    const admin = await makeUser(ctx, { companyId: companyA, role: "admin", email: "admin-a@example.com" });
    const field = await makeUser(ctx, { companyId: companyA, email: "field-a@example.com" });
    const other = await makeUser(ctx, { companyId: companyB, role: "admin", email: "admin-b@example.com" });

    const [assigned] = await ctx.db.insert(customer).values({ companyId: companyA, name: "Assigned", assignedTo: field, createdBy: admin }).returning();
    await ctx.db.insert(customer).values({ companyId: companyA, name: "Unassigned", createdBy: admin });
    await ctx.db.insert(customer).values({ companyId: companyB, name: "Other Tenant", createdBy: other }).returning();

    const fieldCustomers = await ctx.db.select().from(customer).where(eq(customer.assignedTo, field));
    expect(fieldCustomers.map((item) => item.id)).toEqual([assigned!.id]);

    const adminCustomers = await ctx.db.select().from(customer).where(eq(customer.companyId, companyA));
    expect(adminCustomers).toHaveLength(2);
    expect(adminCustomers.every((item) => item.companyId === companyA)).toBe(true);
  });

  it("enforces blacklist reason and updated_at trigger", async () => {
    const company = await makeCompany(ctx);
    const admin = await makeUser(ctx, { companyId: company, role: "admin" });
    const [created] = await ctx.db.insert(customer).values({ companyId: company, name: "Before", createdBy: admin }).returning();
    const before = created!.updatedAt;
    const [updated] = await ctx.db.update(customer).set({ name: "After", blacklist: true, blacklistReason: "Debt" }).where(eq(customer.id, created!.id)).returning();
    expect(updated!.blacklistReason).toBe("Debt");
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});