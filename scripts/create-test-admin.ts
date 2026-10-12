// Legt Test-User für lokale Entwicklung an.
// Verwendung: pnpm exec tsx scripts/create-test-admin.ts
//
// Passwort wird ausschließlich aus DEV_ADMIN_PASSWORD gelesen.

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import pg from "pg";
import bcrypt from "bcryptjs";
import { requireDevAdminPassword } from "../lib/env/non-production";

const { Pool } = pg;

async function main() {
  const password = requireDevAdminPassword();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL nicht gesetzt");
  const pool = new Pool({ connectionString: url });

  const adminHash = await bcrypt.hash(password, 12);
  const fieldHash = await bcrypt.hash(password, 12);

  await pool.query("BEGIN");
  try {
    // Company anlegen falls nicht da
    let { rows: cRows } = await pool.query<{ id: string }>(
      "SELECT id FROM company WHERE name = 'vazi (Test)' LIMIT 1",
    );
    if (cRows.length === 0) {
      cRows = (
        await pool.query<{ id: string }>(
          "INSERT INTO company (name) VALUES ('vazi (Test)') RETURNING id",
        )
      ).rows;
    }
    const companyId = cRows[0]!.id;

    // Admin upsert über email
    await pool.query(
      `INSERT INTO "user" (company_id, email, password_hash, name, role, active)
       VALUES ($1, 'admin@marktsync.test', $2, 'Test-Admin', 'admin', true)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, active = true`,
      [companyId, adminHash],
    );

    // Field-User upsert
    await pool.query(
      `INSERT INTO "user" (company_id, email, password_hash, name, role, active)
       VALUES ($1, 'max@marktsync.test', $2, 'Max Mitarbeiter', 'field_user', true)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, active = true`,
      [companyId, fieldHash],
    );

    await pool.query("COMMIT");
    console.log("Test-User angelegt/aktualisiert:");
    console.log("");
    console.log("  Admin:");
    console.log("    Email:    admin@marktsync.test");
    console.log("");
    console.log("  Field User (Außendienstler):");
    console.log("    Email:    max@marktsync.test");
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
