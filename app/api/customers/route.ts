import { NextRequest } from "next/server";
import { z } from "zod";
import { createCustomer, listCustomers } from "@/lib/customers/repo";
import { requireUser } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";

const customerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().max(10_000).nullish(),
  phone: z.string().max(50).nullish(),
  email: z.string().email().nullish(),
  notes: z.string().max(10_000).nullish(),
  assigned_to: z.string().uuid().nullish(),
  blacklist: z.boolean().optional(),
  blacklist_reason: z.string().trim().max(10_000).nullish(),
}).strict();

export async function GET(req: NextRequest) {
  return withErrorHandler(async () => {
    const user = await requireUser();
    const search = req.nextUrl.searchParams.get("search") ?? undefined;
    if (search && search.length > 100) return validationFailed("Suche darf höchstens 100 Zeichen enthalten", "search");
    return ok(await listCustomers(user, search));
  });
}

export async function POST(req: NextRequest) {
  return withErrorHandler(async () => {
    const user = await requireUser();
    const parsed = customerSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationFailed(parsed.error.issues[0]?.message ?? "Eingabe ungültig", parsed.error.issues[0]?.path.join("."));
    const data = parsed.data;
    return ok(await createCustomer({
      name: data.name,
      address: data.address,
      phone: data.phone,
      email: data.email,
      notes: data.notes,
      assignedTo: data.assigned_to,
      blacklist: data.blacklist,
      blacklistReason: data.blacklist_reason,
    }, user), 201);
  });
}