"use client";

// Zentrales Offline-Management:
//   - Online/Offline-Banner oben
//   - Auto-Sync wenn online wird
//   - Konflikt-Modal nach Sync
//   - Counter für pending Actions in der Topbar

import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CloudOff, RefreshCw, AlertTriangle, Send, Trash2 } from "lucide-react";
import {
  syncPendingActions,
  isOnline as isOnlineCheck,
} from "@/lib/offline/sync";
import {
  countPending,
  listConflicts,
  removeConflict,
  type SyncedConflict,
} from "@/lib/offline/queue";
import { useToast } from "@/components/Toast";

export function OfflineManager() {
  const qc = useQueryClient();
  const toast = useToast();
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [conflicts, setConflicts] = useState<SyncedConflict[]>([]);

  const refreshState = useCallback(async () => {
    setOnline(isOnlineCheck());
    setPendingCount(await countPending());
    setConflicts(await listConflicts());
  }, []);

  const trySync = useCallback(async () => {
    if (!isOnlineCheck()) return;
    setSyncing(true);
    try {
      const r = await syncPendingActions();
      if (r.synced > 0 || r.conflicts > 0) {
        toast.show({
          message: `${r.synced} synchronisiert, ${r.conflicts} Konflikte`,
          durationMs: 4_000,
        });
        qc.invalidateQueries({ queryKey: ["markets"] });
      }
      await refreshState();
    } finally {
      setSyncing(false);
    }
  }, [toast, qc, refreshState]);

  useEffect(() => {
    refreshState();
    function onOnline() {
      setOnline(true);
      trySync();
    }
    function onOffline() {
      setOnline(false);
    }
    function onCustom() {
      refreshState();
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("marktsync:queue-changed", onCustom);
    // Erste Sync-Versuch falls beim Mount online und pending vorhanden
    if (isOnlineCheck()) trySync();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("marktsync:queue-changed", onCustom);
    };
  }, [refreshState, trySync]);

  async function discardConflict(clientId: string) {
    await removeConflict(clientId);
    await refreshState();
  }

  async function reportConflict(c: SyncedConflict) {
    const res = await fetch("/api/v1/actions/report-conflict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        client_id: c.client_id,
        market_id: c.market_id,
        intended_type: c.intended_type,
        intended_result: c.intended_result,
        client_timestamp: c.client_timestamp,
        conflict: c.conflict,
        geo_lat: c.geo_lat,
        geo_lng: c.geo_lng,
      }),
    });
    if (!res.ok) {
      toast.show({ message: "Konnte nicht melden, später erneut.", durationMs: 4_000 });
      return;
    }
    await removeConflict(c.client_id);
    toast.show({ message: "Konflikt an Admin gemeldet.", durationMs: 3_000 });
    await refreshState();
  }

  return (
    <>
      {/* Offline-Banner */}
      {!online && (
        <div className="sticky top-14 z-40 flex items-center gap-2 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <CloudOff className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            Offline-Modus — Aktionen werden gespeichert und synchronisiert, sobald wieder Verbindung
            besteht.
          </span>
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium">
              {pendingCount} pending
            </span>
          )}
        </div>
      )}

      {/* Sync läuft (kurz sichtbar) */}
      {syncing && online && pendingCount > 0 && (
        <div className="sticky top-14 z-40 flex items-center gap-2 bg-blue-50 px-4 py-2 text-sm text-blue-900">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Synchronisiere {pendingCount} Aktion(en) …</span>
        </div>
      )}

      {/* Konflikt-Modal nach Sync */}
      {conflicts.length > 0 && (
        <div className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/50 sm:items-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              <h2 className="text-lg font-semibold">
                {conflicts.length} Aktion{conflicts.length === 1 ? "" : "en"} mit Konflikt
              </h2>
            </div>
            <p className="mb-4 text-sm text-gray-600">
              Während du offline warst, hat sich der Markt geändert. Entscheide für jede Aktion:
            </p>
            <div className="max-h-80 space-y-3 overflow-y-auto">
              {conflicts.map((c) => (
                <ConflictRow
                  key={c.client_id}
                  conflict={c}
                  onDiscard={() => discardConflict(c.client_id)}
                  onReport={() => reportConflict(c)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ConflictRow({
  conflict,
  onDiscard,
  onReport,
}: {
  conflict: SyncedConflict;
  onDiscard: () => void;
  onReport: () => void;
}) {
  const c = conflict.conflict as Record<string, unknown>;
  function describe() {
    if (c.code === "MARKET_MERGED") return "Markt wurde zusammengeführt";
    if (c.code === "MARKET_INACTIVE") return "Markt wurde inaktiv";
    if (c.code === "USER_DEACTIVATED") return "Dein Zugang wurde inzwischen deaktiviert";
    if (c.code === "MARKET_IN_COOLDOWN") return "Markt war im Cooldown";
    if (c.expected_statuses && c.actual_status) {
      return `Status sollte ${(c.expected_statuses as string[]).join(" / ")} sein, war aber: ${c.actual_status}`;
    }
    return "Unbekannter Konflikt";
  }
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="text-sm font-medium text-gray-900">{conflict.market_name}</p>
      <p className="mt-1 text-xs text-gray-500">
        Du wolltest: <strong>{conflict.intended_type}</strong>
        {conflict.intended_result && ` (${conflict.intended_result})`}
      </p>
      <p className="mt-1 text-sm text-amber-700">{describe()}</p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={onReport}
          className="flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-green-600 px-3 text-xs font-semibold text-white"
        >
          <Send className="h-3 w-3" /> An Admin melden
        </button>
        <button
          onClick={onDiscard}
          className="flex min-h-9 items-center justify-center gap-1 rounded-lg border border-gray-300 px-3 text-xs text-gray-700"
        >
          <Trash2 className="h-3 w-3" /> Verwerfen
        </button>
      </div>
    </div>
  );
}
