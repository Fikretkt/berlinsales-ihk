// POST /api/v1/actions/batch-sync — Offline-Sync.

import { NextRequest } from "next/server";
import { z } from "zod";
import { batchSyncActions } from "@/lib/actions/batch-sync";
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

const actionSchema = z.object({
  client_id: z.string().uuid(),
  market_id: z.string().uuid(),
  type: z.enum(ACTION_TYPES),
  result: z.enum(ACTION_RESULTS).nullish(),
  geo_lat: z.number().nullish(),
  geo_lng: z.number().nullish(),
  client_timestamp: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

const bodySchema = z.object({
  actions: z.array(actionSchema).min(1).max(200),
});

export async function POST(req: NextRequest) {
  return withErrorHandler(async () => {
    const user = await requireUser();
    const body = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return validationFailed(parsed.error.issues[0]?.message ?? "Eingabe ungültig");
    }
    const result = await batchSyncActions(parsed.data.actions, user);
    return ok(result, 207);
  });
}
