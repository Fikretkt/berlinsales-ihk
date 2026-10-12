import { z } from "zod";

export const marketCreateRequestSchema = z.object({
  chain_id: z.string().uuid().nullish(),
  name: z.string().min(2).max(200),
  gln: z.string().regex(/^[0-9]{13}$/, "GLN muss 13 Ziffern haben").nullish(),
  street_full: z.string().max(250).nullish(),
  postal_code: z.string().regex(/^[0-9]{5}$/, "PLZ muss 5 Ziffern haben").nullish(),
  city: z.string().max(100).nullish(),
  district: z.string().max(100).nullish(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  contact_person: z.string().max(200).nullish(),
  contact_phone: z.string().max(50).nullish(),
  assigned_user_id: z.string().uuid().nullish(),
  current_solution: z.enum(["keine", "sumup", "zettle", "verifone", "ingenico", "andere", "unbekannt"]).optional(),
  satisfaction: z.enum(["zufrieden", "neutral", "unzufrieden", "unbekannt"]).optional(),
});
