// Test-Helper für Integration-Tests:
//  - Startet einen Postgres-18-Testcontainer (einmal pro Test-Suite)
//  - Spielt alle Migrations ein
//  - Räumt nach jedem Test Tabellen ab (TRUNCATE)
//  - Hat Convenience-Builder für company/user/chain/market

import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import * as schema from "@/lib/db/schema";

const { Pool } = pg;

const MIGRATIONS_DIR = path.resolve("lib/db/migrations");

export type TestDb = NodePgDatabase<typeof schema>;

export interface TestContext {
  container: StartedPostgreSqlContainer;
  pool: pg.Pool;
  db: TestDb;
}

export async function startTestDatabase(): Promise<TestContext> {
  const container = await new PostgreSqlContainer("postgres:18-alpine")
    .withDatabase("marktsync_test")
    .withUsername("marktsync")
    .withPassword("marktsync")
    .withStartupTimeout(60_000)
    .start();

  const pool = new Pool({ connectionString: container.getConnectionUri() });
  process.env.DATABASE_URL = container.getConnectionUri();
  global.__erstePool = pool;

  // Extensions zuerst (wie scripts/migrate.ts)
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pg_trgm";
    CREATE EXTENSION IF NOT EXISTS "citext";
  `);

  // Migrations einspielen
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    await pool.query(sql);
  }

  const db = drizzle(pool, { schema, casing: "snake_case" });
  return { container, pool, db };
}

export async function stopTestDatabase(ctx: TestContext): Promise<void> {
  if (global.__erstePool === ctx.pool) {
    global.__erstePool = undefined;
  }
  await ctx.pool.end();
  await ctx.container.stop();
}

// Räumt User-Daten zwischen Tests ab. Behält Seeds (chain, cooldown_rule).
export async function truncateUserData(ctx: TestContext): Promise<void> {
  await ctx.pool.query(`
    TRUNCATE TABLE
      audit_log, customer, reservation, note, follow_up, action, market,
      password_reset_token, "user", company
    RESTART IDENTITY CASCADE;

    INSERT INTO cooldown_rule (action_type, result, duration_days) VALUES
      ('visit', 'success', 0),
      ('visit', 'no_contact', 3),
      ('visit', 'declined', 30),
      ('visit', 'escalation', 0),
      ('profi_visit', 'success', 0),
      ('profi_visit', 'declined', 60),
      ('delivery', NULL, 0),
      ('control', 'ok', 21),
      ('control', 'problem', 0)
    ON CONFLICT DO NOTHING;
  `);
}

// =============================================================================
// FIXTURE-BUILDERS
// =============================================================================

export async function makeCompany(
  ctx: TestContext,
  name = "Acme Vertrieb",
): Promise<string> {
  const { rows } = await ctx.pool.query<{ id: string }>(
    "INSERT INTO company (name) VALUES ($1) RETURNING id",
    [name],
  );
  return rows[0]!.id;
}

export async function makeUser(
  ctx: TestContext,
  opts: {
    companyId: string;
    email?: string;
    role?: "field_user" | "admin";
    active?: boolean;
    name?: string;
  },
): Promise<string> {
  const email = opts.email ?? `user-${Math.random().toString(36).slice(2)}@example.com`;
  const { rows } = await ctx.pool.query<{ id: string }>(
    `INSERT INTO "user" (company_id, email, name, role, active, password_hash)
     VALUES ($1, $2, $3, $4, $5, 'dummy-hash')
     RETURNING id`,
    [opts.companyId, email, opts.name ?? "Test User", opts.role ?? "field_user", opts.active ?? true],
  );
  return rows[0]!.id;
}

export async function getChainId(ctx: TestContext, name = "Edeka"): Promise<string> {
  const { rows } = await ctx.pool.query<{ id: string }>(
    "SELECT id FROM chain WHERE name = $1",
    [name],
  );
  if (rows.length === 0) throw new Error(`Chain '${name}' not seeded`);
  return rows[0]!.id;
}

let glnCounter = 1;
function nextGln(): string {
  // 13 Ziffern, beginnend bei 4000000000001
  const n = 4000000000000 + glnCounter++;
  return String(n).padStart(13, "0");
}

export async function makeMarket(
  ctx: TestContext,
  opts: {
    companyId: string;
    chainId?: string | null;
    name?: string;
    gln?: string | null;
    active?: boolean;
    mergedIntoId?: string | null;
    assignedUserId?: string | null;
    currentSolution?: schema.CurrentSolution;
    satisfaction?: schema.CustomerSatisfaction;
    district?: string | null;
  },
): Promise<string> {
  const { rows } = await ctx.pool.query<{ id: string }>(
    `INSERT INTO market (
       company_id, chain_id, name, gln, street_full, postal_code, city,
       district, lat, lng, active, merged_into_id, assigned_user_id,
       current_solution, satisfaction
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id`,
    [
      opts.companyId,
      opts.chainId ?? null,
      opts.name ?? "Test-Markt",
      opts.gln === null ? null : (opts.gln ?? nextGln()),
      "Teststr. 1",
      "10115",
      "Berlin",
      opts.district !== undefined ? opts.district : "Mitte",
      "52.5200000",
      "13.4050000",
      opts.active ?? true,
      opts.mergedIntoId ?? null,
      opts.assignedUserId ?? null,
      opts.currentSolution ?? "unbekannt",
      opts.satisfaction ?? "unbekannt",
    ],
  );
  return rows[0]!.id;
}

// =============================================================================
// ACTION-INSERT-HELPER (Trigger-Test-tauglich)
// =============================================================================
// Direkter Insert ohne Application-Layer. Trigger wird gefeuert.
// Liefert entweder die action_id oder wirft den Postgres-Fehler durch.

export async function insertAction(
  ctx: TestContext,
  opts: {
    marketId: string;
    userId: string;
    type:
      | "visit"
      | "profi_visit"
      | "delivery"
      | "control"
      | "cancel_order"
      | "manual_override";
    result?:
      | "success"
      | "escalation"
      | "declined"
      | "no_contact"
      | "ok"
      | "problem"
      | null;
    resultingStatus:
      | "gruen"
      | "blau"
      | "gelb"
      | "orange"
      | "rosa"
      | "rot"
      | "grau";
    cooldownUntil?: Date | null;
    payload?: Record<string, unknown>;
    createdAt?: Date;
  },
): Promise<string> {
  const { rows } = await ctx.pool.query<{ id: string }>(
    `INSERT INTO action (
       market_id, user_id, type, result, resulting_status,
       cooldown_until, payload, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8, NOW()))
     RETURNING id`,
    [
      opts.marketId,
      opts.userId,
      opts.type,
      opts.result ?? null,
      opts.resultingStatus,
      opts.cooldownUntil ?? null,
      JSON.stringify(opts.payload ?? {}),
      opts.createdAt ?? null,
    ],
  );
  return rows[0]!.id;
}

export interface PostgresError extends Error {
  code?: string;
}

export function isPostgresError(err: unknown): err is PostgresError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as PostgresError).code === "string"
  );
}
