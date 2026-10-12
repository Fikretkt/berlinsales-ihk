// GET /api/v1/markets/map — lightweight marker payload for the field map.

import { NextRequest } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { user as userTable } from "@/lib/db/schema";
import { listMarketMapMarkers } from "@/lib/markets/repo";
import { requireUser } from "@/lib/auth/session";
import { HttpError } from "@/lib/http/errors";
import { ok, validationFailed, withErrorHandler } from "@/lib/http/response";

const querySchema = z.object({
  status: z.string().optional(),
  chain_id: z.union([z.string().uuid(), z.literal("none")]).optional(),
  district: z.string().optional(),
  search: z.string().min(1).max(100).optional(),
  last_contact: z.enum(["never", "today", "7d", "30d", "older_than_30d"]).optional(),
  contact_type: z.enum(["visit", "phone", "email", "other"]).optional(),
  reserved_by_me: z.enum(["true"]).optional(),
  assigned_to_me: z.enum(["true"]).optional(),
  assigned_user_id: z.string().uuid().optional(),
});
const STATUS_VALUES = ["gruen", "blau", "gelb", "orange", "rosa", "rot", "grau"] as const;

export async function GET(req: NextRequest) {
  return withErrorHandler(async () => {
    const user = await requireUser();
    const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) {
      return validationFailed("Ungültige Filter");
    }

    if (parsed.data.assigned_user_id) {
      if (user.role !== "admin") {
        throw new HttpError(
          403,
          "FIELD_USER_NOT_ALLOWED",
          "Filter nach beliebigen Mitarbeitern ist nur Admins erlaubt",
        );
      }
      const targetUserRows = await db
        .select({ id: userTable.id })
        .from(userTable)
        .where(
          sql`${userTable.id} = ${parsed.data.assigned_user_id}::uuid AND ${userTable.companyId} = ${user.companyId}::uuid AND ${userTable.active} = TRUE`,
        )
        .limit(1);
      if (targetUserRows.length === 0) {
        throw new HttpError(
          400,
          "INVALID_ASSIGNED_USER",
          "Mitarbeiter nicht gefunden oder gehört nicht zu diesem Unternehmen",
        );
      }
    }

    const status = parsed.data.status?.split(",").map((value) => value.trim()).filter(Boolean);
    const invalidStatus = status?.find((value) => !(STATUS_VALUES as readonly string[]).includes(value));
    if (invalidStatus) return validationFailed(`Ungültiger Status: ${invalidStatus}`, "status");
    const items = await listMarketMapMarkers(user.companyId, user.id, {
      status,
      chainId: parsed.data.chain_id === "none" ? undefined : parsed.data.chain_id,
      withoutChain: parsed.data.chain_id === "none",
      district: parsed.data.district,
      search: parsed.data.search,
      lastContact: parsed.data.last_contact,
      contactType: parsed.data.contact_type,
      reservedByMe: parsed.data.reserved_by_me === "true",
      assignedToMe: parsed.data.assigned_to_me === "true",
      assignedUserId: parsed.data.assigned_user_id,
    });
    return ok({ items });
  });
}
