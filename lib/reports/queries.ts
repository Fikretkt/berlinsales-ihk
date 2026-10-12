// Report-Queries.

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export interface OverviewReport {
  period: { from: string; to: string };
  visits: { total: number; successful: number; escalated: number; declined: number };
  deliveries: number;
  controls: { ok: number; problem: number };
  cancellations: number;
  manualOverrides: number;
  totalActions: number;
}

export async function overviewReport(
  companyId: string,
  from: Date,
  to: Date,
): Promise<OverviewReport> {
  const result = await db.execute<{
    type: string;
    result: string | null;
    count: string;
  }>(sql`
    SELECT type, result, COUNT(*)::text AS count
    FROM action a
    INNER JOIN market m ON m.id = a.market_id
    WHERE m.company_id = ${companyId}::uuid AND a.created_at >= ${from} AND a.created_at < ${to}
    GROUP BY type, result
  `);

  const get = (type: string, result: string | null = null) =>
    parseInt(
      result === null
        ? result === null
          ? result === null
            ? ""
            : ""
          : ""
        : "0",
      10,
    ) ||
    parseInt(
      result?.length
        ? result === null
          ? ""
          : ""
        : "",
      10,
    ) ||
    0;
  // Hilfs-Lookup:
  const lookup = new Map<string, number>();
  for (const r of result.rows) {
    lookup.set(`${r.type}|${r.result ?? "_null"}`, parseInt(r.count, 10));
  }
  const sumType = (type: string) =>
    [...lookup.entries()]
      .filter(([k]) => k.startsWith(`${type}|`))
      .reduce((a, [, v]) => a + v, 0);

  void get;

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    visits: {
      total: sumType("visit"),
      successful: lookup.get("visit|success") ?? 0,
      escalated: lookup.get("visit|escalation") ?? 0,
      declined:
        (lookup.get("visit|declined") ?? 0) +
        (lookup.get("visit|no_contact") ?? 0),
    },
    deliveries: sumType("delivery"),
    controls: {
      ok: lookup.get("control|ok") ?? 0,
      problem: lookup.get("control|problem") ?? 0,
    },
    cancellations: sumType("cancel_order"),
    manualOverrides: sumType("manual_override"),
    totalActions: [...lookup.values()].reduce((a, b) => a + b, 0),
  };
}

// =============================================================================
// Stale Markets — Hänger-Liste
// =============================================================================
export interface StaleMarket {
  marketId: string;
  marketName: string;
  city: string;
  chainName: string;
  reason: "rosa_14d" | "gelb_21d" | "untouched_45d";
  status: string;
  lastActionAt: string | null;
}

export async function staleMarkets(companyId: string): Promise<StaleMarket[]> {
  const result = await db.execute<{
    market_id: string;
    market_name: string;
    city: string;
    chain_name: string;
    computed_status: string;
    last_action_at: string | null;
    reason: string;
  }>(sql`
    WITH last_a AS (
      SELECT DISTINCT ON (market_id)
        market_id, resulting_status, cooldown_until, created_at AS last_action_at
      FROM action
      ORDER BY market_id, created_at DESC
    ),
    derived AS (
      SELECT
        m.id AS market_id,
        m.name AS market_name,
        m.city,
        c.name AS chain_name,
        CASE
          WHEN la.cooldown_until IS NOT NULL AND la.cooldown_until > NOW() THEN 'rot'
          WHEN la.resulting_status IS NOT NULL THEN la.resulting_status::text
          ELSE 'gruen'
        END AS computed_status,
        la.last_action_at,
        EXTRACT(DAY FROM (NOW() - la.last_action_at)) AS days_since_action
      FROM market m
      INNER JOIN chain c ON c.id = m.chain_id
      LEFT JOIN last_a la ON la.market_id = m.id
      WHERE m.company_id = ${companyId}::uuid AND m.active = TRUE AND m.merged_into_id IS NULL
    )
    SELECT
      market_id, market_name, city, chain_name, computed_status, last_action_at::text,
      CASE
        WHEN computed_status = 'rosa' AND days_since_action > 14 THEN 'rosa_14d'
        WHEN computed_status = 'gelb' AND days_since_action > 21 THEN 'gelb_21d'
        WHEN last_action_at IS NULL OR days_since_action > 45 THEN 'untouched_45d'
        ELSE NULL
      END AS reason
    FROM derived
    WHERE (computed_status = 'rosa' AND days_since_action > 14)
       OR (computed_status = 'gelb' AND days_since_action > 21)
       OR (last_action_at IS NULL OR days_since_action > 45)
    ORDER BY reason, last_action_at NULLS FIRST
    LIMIT 200
  `);
  return result.rows.map((r) => ({
    marketId: r.market_id,
    marketName: r.market_name,
    city: r.city,
    chainName: r.chain_name,
    reason: r.reason as StaleMarket["reason"],
    status: r.computed_status,
    lastActionAt: r.last_action_at,
  }));
}

// =============================================================================
// New Markets — letzte N Tage mit Dubletten-Hinweis
// =============================================================================
export interface NewMarketReport {
  marketId: string;
  name: string;
  gln: string;
  chainName: string;
  city: string;
  streetFull: string;
  createdAt: string;
  daysAgo: number;
  createdByName: string | null;
  similarCount: number;
}

export async function newMarketsReport(companyId: string, days = 30): Promise<NewMarketReport[]> {
  const result = await db.execute<{
    id: string;
    name: string;
    gln: string;
    chain_name: string;
    city: string;
    street_full: string;
    created_at: string;
    days_ago: number;
    created_by_name: string | null;
    similar_count: string;
  }>(sql`
    WITH news AS (
      SELECT
        m.id, m.name, m.gln,
        c.name AS chain_name,
        m.city, m.street_full, m.postal_code,
        m.created_at,
        EXTRACT(DAY FROM (NOW() - m.created_at))::int AS days_ago,
        u.name AS created_by_name
      FROM market m
      INNER JOIN chain c ON c.id = m.chain_id
      LEFT JOIN "user" u ON u.id = m.created_by_user_id
      WHERE m.company_id = ${companyId}::uuid AND m.active = TRUE AND m.merged_into_id IS NULL
        AND m.created_at > NOW() - INTERVAL '${sql.raw(String(days))} days'
    )
    SELECT
      n.id, n.name, n.gln, n.chain_name, n.city, n.street_full,
      n.created_at::text, n.days_ago, n.created_by_name,
      (
        SELECT COUNT(*)::text FROM market m2
        WHERE m2.company_id = ${companyId}::uuid AND m2.active = TRUE AND m2.merged_into_id IS NULL
          AND m2.id != n.id
          AND m2.postal_code = n.postal_code
          AND similarity(m2.name, n.name) > 0.4
      ) AS similar_count
    FROM news n
    ORDER BY n.created_at DESC
    LIMIT 200
  `);
  return result.rows.map((r) => ({
    marketId: r.id,
    name: r.name,
    gln: r.gln,
    chainName: r.chain_name,
    city: r.city,
    streetFull: r.street_full,
    createdAt: r.created_at,
    daysAgo: r.days_ago,
    createdByName: r.created_by_name,
    similarCount: parseInt(r.similar_count, 10),
  }));
}
