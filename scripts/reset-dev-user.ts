import { config } from "dotenv";
import bcrypt from "bcryptjs";
import pg from "pg";
import { requireDevAdminPassword } from "../lib/env/non-production";

config({ path: ".env" });
config({ path: ".env.local", override: false });

const { Pool } = pg;
const email = "admin@itmart.local";

async function main() {
  const password = requireDevAdminPassword();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const hash = await bcrypt.hash(password, 12);
    await pool.query("BEGIN");
    let companyId = (
      await pool.query<{ id: string }>(
        "SELECT id FROM company WHERE name = 'ITMART Dev' LIMIT 1",
      )
    ).rows[0]?.id;
    if (!companyId) {
      companyId = (
        await pool.query<{ id: string }>(
          "INSERT INTO company (name) VALUES ('ITMART Dev') RETURNING id",
        )
      ).rows[0]?.id;
    }
    if (!companyId) throw new Error("Unable to resolve ITMART Dev company");
    await pool.query(
      `INSERT INTO "user" (company_id, email, password_hash, name, role, active)
       VALUES ($1, $2, $3, 'ITMART Dev Admin', 'admin', true)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, active = true, role = 'admin'`,
      [companyId, email, hash],
    );
    await pool.query("COMMIT");
    console.log(`Dev admin reset: ${email}`);
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
