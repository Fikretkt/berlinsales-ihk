// PATCH /api/v1/markets/:id/intelligence — Update customer commercial intelligence (field reps & admin)

import { NextRequest } from "next/server";
import { z } from "zod";
import { updateMarket } from "@/lib/markets/crud";
import { requireUser } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";

const idSchema = z.string().uuid();

const intelligenceSchema = z
  .object({
    current_solution: z
      .enum(["keine", "sumup", "zettle", "verifone", "ingenico", "andere", "unbekannt"])
      .optional(),
    satisfaction: z
      .enum(["zufrieden", "neutral", "unzufrieden", "unbekannt"])
      .optional(),
  })
  .refine(
    (d) => d.current_solution !== undefined || d.satisfaction !== undefined,
    "Mindestens ein Feld (current_solution oder satisfaction) muss angegeben sein",
  );

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const user = await requireUser();
    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return validationFailed("Ungültige Markt-ID");
    }
    const body = await req.json().catch(() => null);
    const parsed = intelligenceSchema.safeParse(body);
    if (!parsed.success) {
      return validationFailed(
        parsed.error.issues[0]?.message ?? "Eingabe ungültig",
      );
    }
    await updateMarket(
      id,
      {
        currentSolution: parsed.data.current_solution,
        satisfaction: parsed.data.satisfaction,
      },
      user,
    );
    return ok({ updated: true });
  });
}
