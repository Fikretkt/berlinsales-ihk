// Sync-Logik: schickt alle pending Actions per batch-sync ans Backend.
// Bei Konflikt: speichert SyncedConflict in IndexedDB (UI zeigt sie an).

import {
  listPending,
  removePending,
  bumpRetry,
  saveConflict,
  type PendingAction,
} from "./queue";

interface BatchSyncResponseItem {
  client_id: string;
  action_id?: string;
  new_status?: string;
  conflict?: Record<string, unknown>;
  current_status?: string;
}

interface BatchSyncResponse {
  synced: BatchSyncResponseItem[];
  conflicts: BatchSyncResponseItem[];
}

export interface SyncResult {
  attempted: number;
  synced: number;
  conflicts: number;
  errored: number;
}

export async function syncPendingActions(): Promise<SyncResult> {
  const pending = await listPending();
  if (pending.length === 0) {
    return { attempted: 0, synced: 0, conflicts: 0, errored: 0 };
  }

  // In Batches von 50 schicken (Backend-Limit ist 200)
  const BATCH = 50;
  let synced = 0;
  let conflicts = 0;
  let errored = 0;

  for (let i = 0; i < pending.length; i += BATCH) {
    const slice = pending.slice(i, i + BATCH);
    try {
      const res = await fetch("/api/v1/actions/batch-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          actions: slice.map((a) => ({
            client_id: a.client_id,
            market_id: a.market_id,
            type: a.type,
            result: a.result,
            geo_lat: a.geo_lat,
            geo_lng: a.geo_lng,
            client_timestamp: a.client_timestamp,
            payload: a.payload,
          })),
        }),
      });
      if (!res.ok && res.status !== 207) {
        for (const a of slice) await bumpRetry(a.client_id, `HTTP ${res.status}`);
        errored += slice.length;
        continue;
      }
      const json = (await res.json()).data as BatchSyncResponse;
      // Synced: aus IndexedDB raus
      for (const s of json.synced) {
        await removePending(s.client_id);
        synced++;
      }
      // Conflicts: in conflicts-Store überführen, aus pending raus
      for (const c of json.conflicts) {
        const orig = slice.find((p) => p.client_id === c.client_id);
        if (!orig) continue;
        await saveConflict({
          client_id: orig.client_id,
          market_id: orig.market_id,
          market_name: orig.market_name,
          intended_type: orig.type,
          intended_result: orig.result,
          conflict: c.conflict ?? {},
          client_timestamp: orig.client_timestamp,
          geo_lat: orig.geo_lat,
          geo_lng: orig.geo_lng,
          recorded_at: Date.now(),
        });
        await removePending(orig.client_id);
        conflicts++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      for (const a of slice) await bumpRetry(a.client_id, msg);
      errored += slice.length;
    }
  }

  return { attempted: pending.length, synced, conflicts, errored };
}

// Hilfsfunktion für UI: ist der Client gerade online?
export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

// Hilfsfunktion: original PendingAction wieder rausziehen (für Konflikt-UI)
export type { PendingAction };
