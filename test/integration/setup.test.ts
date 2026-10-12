import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  startTestDatabase,
  stopTestDatabase,
  type TestContext,
} from "../helpers/db";

describe("Integration setup smoke-test", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await startTestDatabase();
  });

  afterAll(async () => {
    if (ctx) await stopTestDatabase(ctx);
  });

  it("Extensions sind installiert", async () => {
    const { rows } = await ctx.pool.query<{ extname: string }>(
      "SELECT extname FROM pg_extension WHERE extname IN ('citext','pg_trgm','uuid-ossp') ORDER BY extname",
    );
    expect(rows.map((r) => r.extname)).toEqual(["citext", "pg_trgm", "uuid-ossp"]);
  });

  it("Alle Kerntabellen existieren", async () => {
    const { rows } = await ctx.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    );
    const names = rows.map((r) => r.table_name);
    for (const t of [
      "action",
      "audit_log",
      "chain",
      "company",
      "cooldown_rule",
      "customer",
      "market",
      "note",
      "password_reset_token",
      "reservation",
      "user",
    ]) {
      expect(names).toContain(t);
    }
  });

  it("View v_market_status existiert", async () => {
    const { rows } = await ctx.pool.query(
      "SELECT 1 FROM information_schema.views WHERE table_name = 'v_market_status'",
    );
    expect(rows.length).toBe(1);
  });

  it("Trigger-Funktion enforce_single_active_vorgang existiert", async () => {
    const { rows } = await ctx.pool.query(
      "SELECT 1 FROM pg_proc WHERE proname = 'enforce_single_active_vorgang'",
    );
    expect(rows.length).toBe(1);
  });

  it("Chain-Seed enthält alle Berlin+Brandenburg-Ketten", async () => {
    const { rows } = await ctx.pool.query<{ name: string }>(
      "SELECT name FROM chain ORDER BY name",
    );
    expect(rows.map((r) => r.name)).toEqual([
      "Edeka",
      "Edeka Center",
      "Marktkauf",
      "NAH & GUT",
      "NP-Markt",
      "REWE",
      "REWE Center",
      "Reichelt",
    ]);
  });

  it("Cooldown-Rule-Seed enthält alle 9 Default-Regeln", async () => {
    const { rows } = await ctx.pool.query<{ c: string }>(
      "SELECT COUNT(*)::text AS c FROM cooldown_rule",
    );
    expect(Number(rows[0]!.c)).toBe(9);
  });
});
