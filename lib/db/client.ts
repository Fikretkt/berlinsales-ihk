import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

declare global {
  var __marktsyncPool: pg.Pool | undefined;
}

function getPool(): pg.Pool {
  if (global.__marktsyncPool) return global.__marktsyncPool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max: 10 });
  // A process-wide pool is required in every environment. Creating one per
  // Proxy property access in production leaks connections under normal load.
  global.__marktsyncPool = pool;
  return pool;
}

export const pool = new Proxy({} as pg.Pool, {
  get(_target, prop, receiver) {
    const target = getPool();
    const value = Reflect.get(target, prop, receiver);
    if (typeof value === "function") {
      return value.bind(target);
    }
    return value;
  },
});
export const db = drizzle(pool, { schema, casing: "snake_case" });
export type DbClient = typeof db;
