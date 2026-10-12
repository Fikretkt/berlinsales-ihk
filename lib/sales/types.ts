import { z } from "zod";
import type {
  SalesStage,
  InterestLevel,
  FeedbackReason,
  FollowUpStatus,
} from "@/lib/db/schema";

export type { SalesStage, InterestLevel, FeedbackReason, FollowUpStatus };

export type FollowUpType = "none" | "1w" | "1m" | "3m" | "custom" | "never_contact";

export const SALES_STAGES = [
  "neu",
  "kontaktiert",
  "interesse",
  "angebot",
  "gewonnen",
  "verloren",
] as const satisfies readonly SalesStage[];

export const INTEREST_LEVELS = [
  "hoch",
  "mittel",
  "niedrig",
  "kein_interesse",
] as const satisfies readonly InterestLevel[];

export const FEEDBACK_REASONS = [
  "preis",
  "andere_loesung",
  "keine_zeit",
  "entscheider_nicht_da",
  "kein_bedarf",
  "spaeter_kontaktieren",
  "sonstiges",
] as const satisfies readonly FeedbackReason[];

export const FOLLOW_UP_TYPES = [
  "none",
  "1w",
  "1m",
  "3m",
  "custom",
  "never_contact",
] as const;

export const salesStageSchema = z.enum(SALES_STAGES);
export const interestLevelSchema = z.enum(INTEREST_LEVELS);
export const feedbackReasonSchema = z.enum(FEEDBACK_REASONS);
export const followUpTypeSchema = z.enum(FOLLOW_UP_TYPES);

export const followUpInputSchema = z.object({
  type: followUpTypeSchema,
  due_at: z.string().optional(),
});

export type FollowUpInput = z.infer<typeof followUpInputSchema>;
