// Demo-User für die Kunden-Vorführung anlegen.
// Idempotent: kann beliebig oft ausgeführt werden, überschreibt nur Passwort + aktiv-Status.
//
// Verwendung: pnpm exec tsx scripts/create-demo-users.ts
//
// Passwort wird ausschließlich aus DEV_ADMIN_PASSWORD gelesen.

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import pg from "pg";
import bcrypt from "bcryptjs";
import { requireDevAdminPassword } from "../lib/env/non-production";

const { Pool } = pg;

type DemoUser = {
  email: string;
  name: string;
  role: "admin" | "field_user";
};

const DEMO_USERS: DemoUser[] = [
  { email: "admin@demo.de", name: "Demo-Admin", role: "admin" },
  { email: "mitarbeiter1@demo.de", name: "Mitarbeiter 1", role: "field_user" },
  { email: "mitarbeiter2@demo.de", name: "Mitarbeiter 2", role: "field_user" },
  { email: "mitarbeiter3@demo.de", name: "Mitarbeiter 3", role: "field_user" },
];

async function main() {
  const password = requireDevAdminPassword();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL nicht gesetzt");
  const pool = new Pool({ connectionString: url });

  await pool.query("BEGIN");
  try {
    let { rows: cRows } = await pool.query<{ id: string }>(
      "SELECT id FROM company WHERE name = 'Demo' LIMIT 1",
    );
    if (cRows.length === 0) {
      cRows = (
        await pool.query<{ id: string }>(
          "INSERT INTO company (name) VALUES ('Demo') RETURNING id",
        )
      ).rows;
    }
    const companyId = cRows[0]!.id;

    for (const u of DEMO_USERS) {
      const hash = await bcrypt.hash(password, 12);
      await pool.query(
        `INSERT INTO "user" (company_id, email, password_hash, name, role, active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (email) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           name = EXCLUDED.name,
           role = EXCLUDED.role,
           active = true`,
        [companyId, u.email, hash, u.name, u.role],
      );
    }

    await pool.query("COMMIT");

    console.log("\n  Demo-Accounts angelegt/aktualisiert:\n");
    console.log("  ┌──────────────────────────────┬──────────────┬─────────────┐");
    console.log("  │ E-Mail                       │ Rolle       │");
    console.log("  ├──────────────────────────────┼──────────────┼─────────────┤");
    for (const u of DEMO_USERS) {
      console.log(
        `  │ ${u.email.padEnd(28)} │ ${u.role.padEnd(11)} │`,
      );
    }
    console.log("  └──────────────────────────────┴──────────────┴─────────────┘\n");
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
