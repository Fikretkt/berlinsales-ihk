import { and, desc, eq, ilike } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog, customer, user as userTable } from "@/lib/db/schema";
import { AUDIT_EVENTS } from "@/lib/audit/events";
import { HttpError, type SessionUser } from "@/lib/http/errors";
import { assertAssignmentCompany, assertCustomerMutationAllowed } from "./rules";

export interface CustomerInput {
  name?: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  assignedTo?: string | null;
  blacklist?: boolean;
  blacklistReason?: string | null;
}

function visibility(user: SessionUser) {
  return user.role === "admin"
    ? eq(customer.companyId, user.companyId)
    : and(eq(customer.companyId, user.companyId), eq(customer.assignedTo, user.id));
}

async function assignedCompany(id: string | null | undefined) {
  if (!id) return undefined;
  const rows = await db.select({ companyId: userTable.companyId }).from(userTable).where(eq(userTable.id, id)).limit(1);
  if (!rows[0]) {
    throw new HttpError(400, "VALIDATION_FAILED", "Unbekannter zugewiesener Benutzer", {
      field: "assigned_to",
    });
  }
  return rows[0];
}

export async function listCustomers(user: SessionUser, search?: string) {
  const conditions = [visibility(user)];
  if (search) conditions.push(ilike(customer.name, `%${search}%`));
  return db.select().from(customer).where(and(...conditions)).orderBy(desc(customer.updatedAt));
}

export async function getCustomer(id: string, user: SessionUser) {
  const rows = await db.select().from(customer).where(and(eq(customer.id, id), visibility(user))).limit(1);
  return rows[0];
}

export async function createCustomer(input: CustomerInput, user: SessionUser) {
  assertCustomerMutationAllowed(user, input);
  assertAssignmentCompany(user, await assignedCompany(input.assignedTo));
  const inserted = await db.transaction(async (tx) => {
    const rows = await tx.insert(customer).values({
      companyId: user.companyId,
      name: input.name!,
      address: input.address ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      notes: input.notes ?? null,
      assignedTo: input.assignedTo ?? null,
      blacklist: input.blacklist ?? false,
      blacklistReason: input.blacklist ? input.blacklistReason!.trim() : null,
      createdBy: user.id,
    }).returning();
    const result = rows[0]!;
    await tx.insert(auditLog).values({ companyId: user.companyId, userId: user.id, event: input.blacklist ? AUDIT_EVENTS.CUSTOMER_BLACKLISTED : AUDIT_EVENTS.CUSTOMER_CREATED, payload: { customer_id: result.id } });
    return result;
  });
  return inserted;
}

export async function updateCustomer(id: string, input: CustomerInput, user: SessionUser) {
  assertCustomerMutationAllowed(user, input);
  const existing = await getCustomer(id, user);
  if (!existing) throw new HttpError(404, "CUSTOMER_NOT_FOUND", "Kunde nicht gefunden");
  assertAssignmentCompany(user, await assignedCompany(input.assignedTo));
  const updated = await db.transaction(async (tx) => {
    const rows = await tx.update(customer).set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.assignedTo !== undefined && { assignedTo: input.assignedTo }),
      ...(input.blacklist !== undefined && { blacklist: input.blacklist, blacklistReason: input.blacklist ? input.blacklistReason!.trim() : null }),
    }).where(and(eq(customer.id, id), eq(customer.companyId, user.companyId))).returning();
    const result = rows[0];
    if (!result) throw new HttpError(404, "CUSTOMER_NOT_FOUND", "Kunde nicht gefunden");
    const event = input.blacklist === true ? AUDIT_EVENTS.CUSTOMER_BLACKLISTED : input.blacklist === false ? AUDIT_EVENTS.CUSTOMER_UNBLACKLISTED : AUDIT_EVENTS.CUSTOMER_UPDATED;
    await tx.insert(auditLog).values({ companyId: user.companyId, userId: user.id, event, payload: { customer_id: id } });
    return result;
  });
  return updated;
}
