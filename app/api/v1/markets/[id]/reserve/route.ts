// POST /api/v1/markets/:id/reserve  → reservieren
// DELETE /api/v1/markets/:id/reserve → eigene aufheben (Admin: fremde)

import { NextRequest } from "next/server";
import { z } from "zod";
import { createReservation, cancelReservation } from "@/lib/reservations/insert";
import { requireUser } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";

const idSchema = z.string().uuid();

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const user = await requireUser();
    const { id } = await params;
    if (!idSchema.safeParse(id).success) return validationFailed("Ungültige Markt-ID");

    const result = await createReservation(id, user);
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
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const user = await requireUser();
    const { id } = await params;
    if (!idSchema.safeParse(id).success) return validationFailed("Ungültige Markt-ID");
    const result = await cancelReservation(id, user);
    return ok(result);
  });
}
