import { describe, expect, it } from "vitest";
import { HttpError, type SessionUser } from "@/lib/http/errors";
import { assertAssignmentCompany, assertCustomerMutationAllowed } from "./rules";

const fieldUser: SessionUser = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "field@example.com",
  name: "Field",
  role: "field_user",
  companyId: "00000000-0000-0000-0000-000000000010",
  bereich: "internal",
};
const adminUser = { ...fieldUser, role: "admin" as const };

describe("customer rules", () => {
  it("rejects field-user assignment and blacklist mutations", () => {
    expect(() => assertCustomerMutationAllowed(fieldUser, { assignedTo: fieldUser.id })).toThrow(HttpError);
    expect(() => assertCustomerMutationAllowed(fieldUser, { blacklist: true })).toThrow(HttpError);
  });

  it("requires a reason when an admin blacklists a customer", () => {
    expect(() => assertCustomerMutationAllowed(adminUser, { blacklist: true })).toThrow(/Grund/);
    expect(() => assertCustomerMutationAllowed(adminUser, { blacklist: true, blacklistReason: "  " })).toThrow(/Grund/);
    expect(() => assertCustomerMutationAllowed(adminUser, { blacklist: true, blacklistReason: "Nicht zahlen" })).not.toThrow();
  });

  it("rejects assignments across companies", () => {
    expect(() => assertAssignmentCompany(adminUser, { companyId: "00000000-0000-0000-0000-000000000099" })).toThrow(HttpError);
    expect(() => assertAssignmentCompany(adminUser, { companyId: adminUser.companyId })).not.toThrow();
  });
});