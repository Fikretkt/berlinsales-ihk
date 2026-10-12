// POST /api/v1/markets/:id/actions

import { NextRequest } from "next/server";
import { z } from "zod";
import { insertAction } from "@/lib/actions/insert";
import { requireUser } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";

const ACTION_TYPES = [
  "visit",
  "profi_visit",
  "delivery",
  "control",
  "cancel_order",
  "manual_override",
] as const;

const ACTION_RESULTS = [
  "success",
  "escalation",
  "declined",
  "no_contact",
  "ok",
  "problem",
] as const;

const bodySchema = z
  .object({
    type: z.enum(ACTION_TYPES),
    result: z.enum(ACTION_RESULTS).nullish(),
    geo_lat: z.number().min(-90).max(90).nullish(),
    geo_lng: z.number().min(-180).max(180).nullish(),
    client_timestamp: z.string().datetime().nullish(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (d) => {
      // Pflicht-Felder pro Action-Typ (Schema-CHECK macht das auch, hier für klarere Fehler)
      if (d.type === "manual_override") {
        const ts = d.payload?.target_status;
        const reason = d.payload?.reason;
        return (
          typeof ts === "string" &&
          ["gruen", "gelb", "orange", "rosa", "rot", "grau"].includes(ts) &&
          typeof reason === "string" &&
          reason.length > 0
        );
      }
      if (d.type === "cancel_order") {
        return typeof d.payload?.reason === "string" && (d.payload.reason as string).length > 0;
      }
      if (d.type === "control" && d.result === "problem") {
        return (
          typeof d.payload?.problem_description === "string" &&
          (d.payload.problem_description as string).length > 0
        );
      }
      return true;
    },
    { message: "Pflicht-Felder im payload fehlen" },
  );

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const user = await requireUser();
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return validationFailed("Ungültige Markt-ID");
    }
    const body = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return validationFailed(parsed.error.issues[0]?.message ?? "Eingabe ungültig");
    }

    const result = await insertAction(
      {
        marketId: id,
        type: parsed.data.type,
        result: parsed.data.result ?? null,
        geoLat: parsed.data.geo_lat ?? null,
        geoLng: parsed.data.geo_lng ?? null,
        clientTimestamp: parsed.data.client_timestamp
          ? new Date(parsed.data.client_timestamp)
          : null,
        payload: parsed.data.payload,
      },
      user,
    );

    return ok(
      {
        action_id: result.actionId,
        new_status: result.newStatus,
        cooldown_until: result.cooldownUntil,
        distance_meters: result.distanceMeters,
        distance_warning: result.distanceWarning,
      },
      201,
    );
  });
}
