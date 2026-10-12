import { HttpError, type SessionUser } from "@/lib/http/errors";

export function assertCustomerMutationAllowed(
  user: SessionUser,
  input: { assignedTo?: string | null; blacklist?: boolean; blacklistReason?: string | null },
): void {
  if (user.role === "field_user" && (input.assignedTo !== undefined || input.blacklist !== undefined)) {
    throw new HttpError(403, "FIELD_USER_NOT_ALLOWED", "Zuweisung und Sperrlistenstatus sind Admins vorbehalten");
  }
  if (input.blacklist === true && !input.blacklistReason?.trim()) {
    throw new HttpError(400, "VALIDATION_FAILED", "Ein Grund ist für die Sperrliste erforderlich", {
      field: "blacklist_reason",
    });
  }
}

export function assertAssignmentCompany(
  user: SessionUser,
  assignedUser: { companyId: string } | undefined,
): void {
  if (assignedUser && assignedUser.companyId !== user.companyId) {
    throw new HttpError(400, "VALIDATION_FAILED", "Zugewiesener Benutzer gehört zu einer anderen Firma", {
      field: "assigned_to",
    });
  }
}