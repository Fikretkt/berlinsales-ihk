// GET /api/v1/markets/:id — Detailansicht.
// PATCH /api/v1/markets/:id — Bearbeiten (Admin)

import { NextRequest } from "next/server";
import { z } from "zod";
import { getMarketDetail } from "@/lib/markets/repo";
import { updateMarket } from "@/lib/markets/crud";
import { requireUser, requireAdmin } from "@/lib/auth/session";
import { ok, fail, withErrorHandler, validationFailed } from "@/lib/http/response";

const idSchema = z.string().uuid();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const user = await requireUser();
    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return validationFailed("Ungültige Markt-ID");
    }

    const result = await getMarketDetail(user.companyId, id);
    if (result.kind === "not_found") {
      return fail(
        { code: "MARKET_NOT_FOUND", message: "Markt nicht gefunden" },
        404,
      );
    }
    if (result.kind === "merged") {
      return fail(
        {
          code: "MARKET_MERGED",
          message: "Markt wurde mit einem anderen zusammengeführt",
          details: { merged_into_id: result.mergedIntoId },
        },
        410,
      );
    }
    return ok(result.market);
  });
}

const patchSchema = z
  .object({
    name: z.string().min(2).max(200).optional(),
    chain_id: z.string().uuid().optional(),
    street_full: z.string().min(2).max(250).optional(),
    postal_code: z.string().regex(/^[0-9]{5}$/).optional(),
    city: z.string().min(1).max(100).optional(),
    district: z.string().max(100).nullable().optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    contact_person: z.string().max(200).nullable().optional(),
    contact_phone: z.string().max(50).nullable().optional(),
    assigned_user_id: z.string().uuid().nullable().optional(),
    current_solution: z
      .enum(["keine", "sumup", "zettle", "verifone", "ingenico", "andere", "unbekannt"])
      .optional(),
    satisfaction: z
      .enum(["zufrieden", "neutral", "unzufrieden", "unbekannt"])
      .optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Mindestens ein Feld muss angegeben sein");

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const user = await requireAdmin();
    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return validationFailed("Ungültige Markt-ID");
    }
    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return validationFailed(
        parsed.error.issues[0]?.message ?? "Eingabe ungültig",
      );
    }
    await updateMarket(
      id,
      {
        name: parsed.data.name,
        chainId: parsed.data.chain_id,
        streetFull: parsed.data.street_full,
        postalCode: parsed.data.postal_code,
        city: parsed.data.city,
        district: parsed.data.district,
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        contactPerson: parsed.data.contact_person,
        contactPhone: parsed.data.contact_phone,
        assignedUserId: parsed.data.assigned_user_id,
        currentSolution: parsed.data.current_solution,
        satisfaction: parsed.data.satisfaction,
      },
      user,
    );
    return ok({ updated: true });
  });
}
