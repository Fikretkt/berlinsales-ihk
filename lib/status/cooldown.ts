// Cooldown-Snapshot-Berechnung.
//
// Konvention: duration_days = 0 → cooldown_until = NULL (kein Cooldown).
// Backend setzt NICHT NOW+0, sondern explizit NULL.
// Spätere Änderungen an cooldown_rule wirken nur auf neue Aktionen.

import { and, eq, isNull } from "drizzle-orm";
import { addDays } from "date-fns";
import { cooldownRule } from "@/lib/db/schema";
import type {
  ActionTypeValue,
  ActionResultValue,
} from "@/lib/db/schema";
import type { DbClient } from "@/lib/db/client";

export class MissingCooldownRuleError extends Error {
  constructor(
    public readonly type: ActionTypeValue,
    public readonly result: ActionResultValue | null,
  ) {
    super(`No cooldown rule for ${type}/${result}`);
    this.name = "MissingCooldownRuleError";
  }
}

export async function getCooldownUntil(
  type: ActionTypeValue,
  result: ActionResultValue | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: DbClient | any,
  now: Date = new Date(),
): Promise<Date | null> {
  const [rule] = await db
    .select({ durationDays: cooldownRule.durationDays })
    .from(cooldownRule)
    .where(
      and(
        eq(cooldownRule.actionType, type),
        result === null
          ? isNull(cooldownRule.result)
          : eq(cooldownRule.result, result),
      ),
    )
    .limit(1);

  if (!rule) throw new MissingCooldownRuleError(type, result);

  // WICHTIG: NULL bei 0 Tagen, nicht NOW+0.
  if (rule.durationDays === 0) return null;

  return addDays(now, rule.durationDays);
}
