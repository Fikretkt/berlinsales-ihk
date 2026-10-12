// IndexedDB-Wrapper für Offline-Aktionen + Konflikt-Berichte.
// Wird nur im Browser genutzt (alle Funktionen prüfen typeof window).

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type ActionType =
  | "visit"
  | "profi_visit"
  | "delivery"
  | "control"
  | "cancel_order"
  | "manual_override";

export type ActionResult =
  | "success"
  | "escalation"
  | "declined"
  | "no_contact"
  | "ok"
  | "problem";

export interface PendingAction {
  client_id: string; // UUID v4
  market_id: string;
  market_name: string; // für UI-Anzeige
  type: ActionType;
  result: ActionResult | null;
  geo_lat: number | null;
  geo_lng: number | null;
  client_timestamp: string;
  payload: Record<string, unknown>;
  retry_count: number;
  last_error?: string;
  created_at: number; // epoch ms
}

export interface SyncedConflict {
  client_id: string;
  market_id: string;
  market_name: string;
  intended_type: string;
  intended_result: string | null;
  conflict: Record<string, unknown>;
  client_timestamp: string;
  geo_lat: number | null;
  geo_lng: number | null;
  recorded_at: number;
}

interface MarktSyncDB extends DBSchema {
  pending: {
    key: string; // client_id
    value: PendingAction;
    indexes: { "by-created": number };
  };
  conflicts: {
    key: string; // client_id
    value: SyncedConflict;
  };
}

const DB_NAME = "marktsync";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<MarktSyncDB>> | null = null;

function getDB(): Promise<IDBPDatabase<MarktSyncDB>> {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB nicht verfügbar (SSR)");
  }
  if (dbPromise) return dbPromise;
  dbPromise = openDB<MarktSyncDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("pending")) {
        const store = db.createObjectStore("pending", { keyPath: "client_id" });
        store.createIndex("by-created", "created_at");
      }
      if (!db.objectStoreNames.contains("conflicts")) {
        db.createObjectStore("conflicts", { keyPath: "client_id" });
      }
    },
  });
  return dbPromise;
}

export function generateClientId(): string {
  // crypto.randomUUID gibt's seit Chrome 92 / Firefox 95 / Safari 15.4
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback
  const hex = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += "-";
    else if (i === 14) s += "4";
    else if (i === 19) s += hex[(Math.random() * 4) | (8 & 0xf)];
    else s += hex[(Math.random() * 16) | 0];
  }
  return s;
}

export async function enqueueAction(action: Omit<PendingAction, "retry_count" | "created_at">): Promise<void> {
  const db = await getDB();
  await db.put("pending", {
    ...action,
    retry_count: 0,
    created_at: Date.now(),
  });
}

export async function listPending(): Promise<PendingAction[]> {
  const db = await getDB();
  return (await db.getAllFromIndex("pending", "by-created")) ?? [];
}

export async function removePending(clientId: string): Promise<void> {
  const db = await getDB();
  await db.delete("pending", clientId);
}

export async function bumpRetry(clientId: string, errorMsg: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get("pending", clientId);
  if (!existing) return;
  await db.put("pending", {
    ...existing,
    retry_count: existing.retry_count + 1,
    last_error: errorMsg,
  });
}

export async function countPending(): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  try {
    const db = await getDB();
    return await db.count("pending");
  } catch {
    return 0;
  }
}

// =============================================================================
// Konflikte (Anzeige im UI nach Sync)
// =============================================================================
export async function saveConflict(c: SyncedConflict): Promise<void> {
  const db = await getDB();
  await db.put("conflicts", c);
}

export async function listConflicts(): Promise<SyncedConflict[]> {
  const db = await getDB();
  return (await db.getAll("conflicts")) ?? [];
}

export async function removeConflict(clientId: string): Promise<void> {
  const db = await getDB();
  await db.delete("conflicts", clientId);
}

export async function countConflicts(): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  try {
    const db = await getDB();
    return await db.count("conflicts");
  } catch {
    return 0;
  }
}
