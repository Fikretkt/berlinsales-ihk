// Drizzle-Migration-Runner für Production und CI.
// Spielt zuerst die generierten Drizzle-Migrations (0000_*) ein,
// danach die handgeschriebenen Raw-SQL-Migrations (0001_*, ...).
//
// Verwendung:
//   pnpm db:generate         -> generiert 0000_*.sql aus schema.ts
//   pnpm db:migrate          -> spielt alle .sql in lib/db/migrations ein

import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: false });
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

const MIGRATIONS_DIR = path.resolve("lib/db/migrations");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required. Copy .env.example to .env for local development.");
  const target = new URL(url);
  console.log(`Connecting to PostgreSQL at ${target.hostname}:${target.port || "5432"}/${target.pathname.slice(1)}`);

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();

  try {
    // Pre-Migration: Postgres-Extensions installieren.
    // Müssen VOR allen Drizzle-Migrations da sein (citext-Spalte in user).
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS "pg_trgm";
      CREATE EXTENSION IF NOT EXISTS "citext";
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS __migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        "SELECT 1 FROM __migrations WHERE filename = $1",
        [file],
      );
      if (rows.length > 0) {
        console.log(`  skip ${file} (already applied)`);
        continue;
      }

      console.log(`apply ${file}`);
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO __migrations (filename) VALUES ($1)",
          [file],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    console.log("Done.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
