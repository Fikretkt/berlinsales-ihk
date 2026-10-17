import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

declare global {
  var __erstePool: pg.Pool | undefined;
  var __zweitePool: pg.Pool | undefined;
}

function getErstePool(): pg.Pool {
  if (global.__erstePool) return global.__erstePool;
  const url = process.env.DATABASE_URL_ERSTE;
  if (!url) throw new Error("DATABASE_URL_ERSTE is not set");
  const pool = new Pool({ connectionString: url, max: 10 });
  global.__erstePool = pool;
  return pool;
}

function getZweitePool(): pg.Pool {
  if (global.__zweitePool) return global.__zweitePool;
  const url = process.env.DATABASE_URL_ZWEITE;
  if (!url) {
    throw new Error("DATABASE_URL_ZWEITE is not set");
  }
  const pool = new Pool({ connectionString: url, max: 10 });
  global.__zweitePool = pool;
  return pool;
}


export const erstePool = new Proxy({} as pg.Pool, {
  get(_target, prop, receiver) {
    const target = getErstePool();
    const value = Reflect.get(target, prop, receiver);
    if (typeof value === "function") {
      return value.bind(target);
    }
    return value;
  },
});

export const zweitePool = new Proxy({} as pg.Pool, {
  get(_target, prop, receiver) {
    const target = getZweitePool();
    const value = Reflect.get(target, prop, receiver);
    if (typeof value === "function") {
      return value.bind(target);
    }
    return value;
  },
});
export const ersteDb = drizzle(erstePool, { schema, casing: "snake_case" });
export const zweiteDb = drizzle(zweitePool, { schema, casing: "snake_case" });

export const pool = erstePool;
export const db = ersteDb;
export type DbClient = typeof db;
