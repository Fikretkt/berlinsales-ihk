// POST /api/v1/markets/:id/reserve  → reservieren
// DELETE /api/v1/markets/:id/reserve → eigene aufheben (Admin: fremde)

import { NextRequest } from "next/server";
import { z } from "zod";
import { createReservation, cancelReservation } from "@/lib/reservations/insert";
import { requireUser } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";
import { hostDbAuswahl } from "@/lib/db/dbAuswahl";
import { HttpError } from "@/lib/http/errors";

const idSchema = z.string().uuid();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const host = req.headers.get("host");

    if (!host) {
      throw new HttpError(400, "HOST_REQUIRED", "Host fehlt");
    }

    const requestDb = hostDbAuswahl(host);
    const user = await requireUser(requestDb);
    const { id } = await params;
    if (!idSchema.safeParse(id).success) return validationFailed("Ungültige Markt-ID");

    const result = await createReservation(id, user, requestDb);
    return ok(
      {
        reservation_id: result.reservationId,
        valid_until: result.validUntil.toISOString(),
      },
      201,
    );
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const host = req.headers.get("host");

    if (!host) {
      throw new HttpError(400, "HOST_REQUIRED", "Host fehlt");
    }

    const requestDb = hostDbAuswahl(host);
    const user = await requireUser(requestDb);
    const { id } = await params;
    if (!idSchema.safeParse(id).success) return validationFailed("Ungültige Markt-ID");
    const result = await cancelReservation(id, user, requestDb);
    return ok(result);
  });
}
