import { NextRequest } from "next/server";
import { z } from "zod";
import { getCustomer, updateCustomer } from "@/lib/customers/repo";
import { requireUser } from "@/lib/auth/session";
import { HttpError } from "@/lib/http/errors";
import { fail, ok, withErrorHandler, validationFailed } from "@/lib/http/response";

const idSchema = z.string().uuid();
const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  address: z.string().max(10_000).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().email().nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  blacklist: z.boolean().optional(),
  blacklist_reason: z.string().trim().max(10_000).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Mindestens ein Feld muss angegeben sein");

async function customerId(id: string) {
  if (!idSchema.safeParse(id).success) throw new HttpError(400, "VALIDATION_FAILED", "Ungültige Kunden-ID", { field: "id" });
  return id;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandler(async () => {
    const user = await requireUser();
    const id = await customerId((await params).id);
    const result = await getCustomer(id, user);
    if (!result) return fail({ code: "CUSTOMER_NOT_FOUND", message: "Kunde nicht gefunden" }, 404);
    return ok(result);
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandler(async () => {
    const user = await requireUser();
    const id = await customerId((await params).id);
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationFailed(parsed.error.issues[0]?.message ?? "Eingabe ungültig", parsed.error.issues[0]?.path.join("."));
    const data = parsed.data;
    return ok(await updateCustomer(id, {
      name: data.name,
      address: data.address,
      phone: data.phone,
      email: data.email,
      notes: data.notes,
      assignedTo: data.assigned_to,
      blacklist: data.blacklist,
      blacklistReason: data.blacklist_reason,
    }, user));
  });
}