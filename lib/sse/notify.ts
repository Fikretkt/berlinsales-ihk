// Helper für pg_notify aus Backend-Code.
// Klein gehalten (Markt-ID + Status), Frontend macht Detail-Refetch via REST.

import { sql } from "drizzle-orm";
import type { DbClient } from "@/lib/db/client";

export async function notifyMarketUpdated(
  marketId: string,
  status: string,
  requestDb: DbClient,
): Promise<void> {
  const payload = JSON.stringify({
    market_id: marketId,
    status,
  });

  await requestDb.execute(
    sql`SELECT pg_notify('market_updated', ${payload})`,
  );
}

export async function notifyMarketsBulkUpdated(
  marketIds: string[],
  requestDb: DbClient,
): Promise<void> {
  if (marketIds.length === 0) return;

  const payload = JSON.stringify({
    market_ids: marketIds,
  });

  await requestDb.execute(
    sql`SELECT pg_notify('markets_bulk_updated', ${payload})`,
  );
}