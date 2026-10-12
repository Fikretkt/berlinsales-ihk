// GET /api/v1/markets — Liste (alle User)
// POST /api/v1/markets — Markt anlegen (alle eingeloggten User mit Dubletten-Warnung)

import { NextRequest } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { user as userTable } from "@/lib/db/schema";
import { listMarkets } from "@/lib/markets/repo";
import { createMarket } from "@/lib/markets/crud";
import { marketCreateRequestSchema } from "@/lib/markets/create-request";
import { requireUser } from "@/lib/auth/session";
import { HttpError } from "@/lib/http/errors";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";

const STATUS_VALUES = [
  "gruen",
  "blau",
  "gelb",
  "orange",
  "rosa",
  "rot",
  "grau",
] as const;

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
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
});

export async function GET(req: NextRequest) {
  return withErrorHandler(async () => {
    const user = await requireUser();

    const parsed = querySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!parsed.success) {
      return validationFailed(
        parsed.error.issues[0]?.message ?? "Ungültige Query-Parameter",
      );
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

    let statusList: string[] | undefined;
    if (parsed.data.status) {
      statusList = parsed.data.status
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const invalid = statusList.find(
        (s) => !(STATUS_VALUES as readonly string[]).includes(s),
      );
      if (invalid) {
        return validationFailed(`Ungültiger Status: ${invalid}`, "status");
      }
    }

    const result = await listMarkets(user.companyId, user.id, {
      status: statusList,
      chainId: parsed.data.chain_id === "none" ? undefined : parsed.data.chain_id,
      withoutChain: parsed.data.chain_id === "none",
      district: parsed.data.district,
      search: parsed.data.search,
      lastContact: parsed.data.last_contact,
      contactType: parsed.data.contact_type,
      reservedByMe: parsed.data.reserved_by_me === "true",
      assignedToMe: parsed.data.assigned_to_me === "true",
      assignedUserId: parsed.data.assigned_user_id,
      limit: parsed.data.limit,
      cursor: parsed.data.cursor,
    });

    return ok({ items: result.items, next_cursor: result.nextCursor });
  });
}

// =============================================================================
// POST: Markt anlegen
// =============================================================================
export async function POST(req: NextRequest) {
  return withErrorHandler(async () => {
    const user = await requireUser();
    const body = await req.json().catch(() => null);
    const parsed = marketCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return validationFailed(
        parsed.error.issues[0]?.message ?? "Eingabe ungültig",
        parsed.error.issues[0]?.path.join(".") || undefined,
      );
    }
    const result = await createMarket(
      {
        chainId: parsed.data.chain_id,
        name: parsed.data.name,
        gln: parsed.data.gln,
        streetFull: parsed.data.street_full ?? "",
        postalCode: parsed.data.postal_code,
        city: parsed.data.city,
        district: parsed.data.district ?? null,
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        contactPerson: parsed.data.contact_person ?? null,
        contactPhone: parsed.data.contact_phone ?? null,
        assignedUserId: parsed.data.assigned_user_id,
        currentSolution: parsed.data.current_solution,
        satisfaction: parsed.data.satisfaction,
      },
      user,
    );
    return ok(
      {
        market_id: result.marketId,
        ...(result.warning ? { warning: result.warning } : {}),
      },
      201,
    );
  });
}
