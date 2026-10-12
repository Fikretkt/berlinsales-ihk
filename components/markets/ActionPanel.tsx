"use client";

// Action-Panel: zeigt erlaubte Aktionen je nach Markt-Status (Trigger-Tabelle).
// Mobile-first, deutsche Klartext-Buttons, Pflicht-Dialog-Flows.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Truck,
  ClipboardCheck,
  Ban,
  ShieldAlert,
  Star,
  Calendar,
} from "lucide-react";
import { Dialog } from "./Dialog";
import {
  postAction,
  postReserve,
  deleteReserve,
  type ActionInput,
  type ApiError,
} from "@/lib/markets/actions-client";
import { getCurrentPosition } from "@/lib/geo/client";
import { useToast } from "@/components/Toast";
import { enqueueAction, generateClientId } from "@/lib/offline/queue";
import type { MarketStatus } from "@/lib/db/schema";

interface MarketProps {
  id: string;
  name?: string;
  computedStatus: MarketStatus;
  reservedByUserId: string | null;
}

interface SessionProps {
  userId: string;
  isAdmin: boolean;
}

export function ActionPanel({
  market,
  session,
}: {
  market: MarketProps;
  session: SessionProps;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDialog, setActiveDialog] = useState<
    null | "visit" | "control" | "cancel_order" | "manual_override"
  >(null);

  async function runAction(input: ActionInput): Promise<boolean> {
    setError(null);
    setPending(true);
    try {
      const pos = await getCurrentPosition();

      // Offline-Pfad: in IndexedDB queuen statt POST
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        // manual_override im Offline-Modus nicht erlauben — passt nicht in Sync-Logik
        if (input.type === "manual_override") {
          setError("Manuelle Status-Überschreibung geht nur online.");
          return false;
        }
        await enqueueAction({
          client_id: generateClientId(),
          market_id: market.id,
          market_name: market.name ?? "Markt",
          type: input.type,
          result: input.result ?? null,
          geo_lat: pos?.lat ?? null,
          geo_lng: pos?.lng ?? null,
          client_timestamp: new Date().toISOString(),
          payload: input.payload ?? {},
        });
        window.dispatchEvent(new Event("marktsync:queue-changed"));
        toast.show({
          message: "Offline gespeichert — wird synchronisiert sobald online.",
          durationMs: 4_000,
        });
        return true;
      }

      const res = await postAction(market.id, {
        ...input,
        geo_lat: pos?.lat ?? null,
        geo_lng: pos?.lng ?? null,
      });
      if (!res.ok) {
        setError(translateError(res.error));
        return false;
      }
      if (res.data.distance_warning) {
        setError(
          `Hinweis: Du scheinst weit weg vom Markt zu sein (${res.data.distance_meters} m). Aktion wurde trotzdem gespeichert.`,
        );
      }
      // Rückgängig-Toast (außer bei manual_override)
      if (input.type !== "manual_override") {
        const actionId = res.data.action_id;
        toast.show({
          message: "Gespeichert.",
          durationMs: 30_000,
          action: {
            label: "Rückgängig",
            onClick: async () => {
              const undoRes = await fetch(`/api/v1/actions/${actionId}`, {
                method: "DELETE",
                credentials: "include",
              });
              if (!undoRes.ok) {
                const j = await undoRes.json().catch(() => null);
                toast.show({
                  message: j?.error?.message ?? "Konnte nicht zurücknehmen",
                  durationMs: 4_000,
                });
                return;
              }
              router.refresh();
              toast.show({ message: "Aktion zurückgenommen.", durationMs: 3_000 });
            },
          },
        });
      } else {
        toast.show({ message: "Status überschrieben.", durationMs: 4_000 });
      }
      router.refresh();
      return true;
    } finally {
      setPending(false);
    }
  }

  async function reserve() {
    setError(null);
    setPending(true);
    try {
      const res = await postReserve(market.id);
      if (!res.ok) setError(translateError(res.error));
      else router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function unreserve() {
    setError(null);
    setPending(true);
    try {
      const res = await deleteReserve(market.id);
      if (!res.ok) setError(translateError(res.error));
      else router.refresh();
    } finally {
      setPending(false);
    }
  }

  // Bestimme verfügbare Aktionen basierend auf Status (Trigger-Tabelle)
  const status = market.computedStatus;
  const isReservedByOther = !!market.reservedByUserId && market.reservedByUserId !== session.userId;
  const isReservedByMe = market.reservedByUserId === session.userId;
  const canReserve = ["gruen", "gelb", "orange", "rosa"].includes(status) && !market.reservedByUserId;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <h2 className="mb-3 text-base font-semibold">Was möchtest du machen?</h2>

      <div className="space-y-2">
        {/* Grüner Markt → Check-in */}
        {(status === "gruen" || status === "blau") && (
          <PrimaryBtn
            disabled={pending || isReservedByOther}
            onClick={() => setActiveDialog("visit")}
            icon={<MapPin className="h-5 w-5" />}
            label="Ich bin im Markt"
            hint={isReservedByOther ? "Markt ist von Kollegin reserviert" : undefined}
          />
        )}

        {/* Gelber Markt → Lieferung oder Stornierung */}
        {status === "gelb" && (
          <>
            <PrimaryBtn
              disabled={pending}
              onClick={() => runAction({ type: "delivery" })}
              icon={<Truck className="h-5 w-5" />}
              label="Lieferung erfolgt"
            />
            <SecondaryBtn
              disabled={pending}
              onClick={() => setActiveDialog("cancel_order")}
              icon={<Ban className="h-5 w-5" />}
              label="Bestellung storniert"
            />
          </>
        )}

        {/* Oranger Markt → Kontrolle */}
        {status === "orange" && (
          <PrimaryBtn
            disabled={pending}
            onClick={() => setActiveDialog("control")}
            icon={<ClipboardCheck className="h-5 w-5" />}
            label="Kontrolle abschließen"
          />
        )}

        {/* Rosa Markt → Persönliches Gespräch */}
        {status === "rosa" && (
          <>
            <PrimaryBtn
              disabled={pending}
              onClick={() =>
                runAction({ type: "profi_visit", result: "success" })
              }
              icon={<Star className="h-5 w-5" />}
              label="Gespräch erfolgreich"
            />
            <SecondaryBtn
              disabled={pending}
              onClick={() => {
                if (
                  confirm(
                    "Sicher? Der Markt wird für 60 Tage gesperrt (Gespräch final abgelehnt).",
                  )
                )
                  runAction({ type: "profi_visit", result: "declined" });
              }}
              icon={<Ban className="h-5 w-5" />}
              label="Gespräch abgelehnt (final)"
            />
          </>
        )}

        {/* Reservierungs-Knöpfe */}
        {canReserve && (
          <SecondaryBtn
            disabled={pending}
            onClick={reserve}
            icon={<Calendar className="h-5 w-5" />}
            label="Für heute reservieren"
          />
        )}
        {isReservedByMe && (
          <SecondaryBtn
            disabled={pending}
            onClick={unreserve}
            icon={<Calendar className="h-5 w-5" />}
            label="Reservierung aufheben"
          />
        )}

        {/* Admin: manual_override immer */}
        {session.isAdmin && (
          <SecondaryBtn
            disabled={pending}
            onClick={() => setActiveDialog("manual_override")}
            icon={<ShieldAlert className="h-5 w-5" />}
            label="Status manuell überschreiben (Admin)"
          />
        )}

        {/* Hinweis wenn Markt gesperrt */}
        {status === "rot" && !session.isAdmin && (
          <p className="text-sm text-gray-500">
            Markt ist gesperrt. Keine Aktion möglich.
          </p>
        )}
        {status === "grau" && !session.isAdmin && (
          <p className="text-sm text-gray-500">
            Markt ist inaktiv. Keine Aktion möglich.
          </p>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Dialoge */}
      <VisitDialog
        open={activeDialog === "visit"}
        onClose={() => setActiveDialog(null)}
        onSubmit={async (input) => {
          const ok = await runAction(input);
          if (ok) setActiveDialog(null);
        }}
        pending={pending}
      />
      <ControlDialog
        open={activeDialog === "control"}
        onClose={() => setActiveDialog(null)}
        onSubmit={async (input) => {
          const ok = await runAction(input);
          if (ok) setActiveDialog(null);
        }}
        pending={pending}
      />
      <CancelOrderDialog
        open={activeDialog === "cancel_order"}
        onClose={() => setActiveDialog(null)}
        onSubmit={async (input) => {
          const ok = await runAction(input);
          if (ok) setActiveDialog(null);
        }}
        pending={pending}
      />
      <ManualOverrideDialog
        open={activeDialog === "manual_override"}
        onClose={() => setActiveDialog(null)}
        onSubmit={async (input) => {
          const ok = await runAction(input);
          if (ok) setActiveDialog(null);
        }}
        pending={pending}
      />
    </div>
  );
}

// =============================================================================
// Button-Komponenten
// =============================================================================
function PrimaryBtn({
  onClick,
  disabled,
  icon,
  label,
  hint,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-14 w-full items-center justify-center gap-3 rounded-lg bg-green-600 px-4 text-base font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-50"
    >
      {icon}
      <span className="text-left">
        {label}
        {hint && (
          <span className="block text-xs font-normal text-green-100">{hint}</span>
        )}
      </span>
    </button>
  );
}

function SecondaryBtn({
  onClick,
  disabled,
  icon,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
}

// =============================================================================
// Dialoge
// =============================================================================
function VisitDialog({
  open,
  onClose,
  onSubmit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: ActionInput) => void;
  pending: boolean;
}) {
  return (
    <Dialog open={open} title="Wie lief der Besuch?" onClose={onClose}>
      <div className="space-y-2">
        <BigChoice
          icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
          label="Erfolgreich verkauft"
          onClick={() => onSubmit({ type: "visit", result: "success" })}
          disabled={pending}
        />
        <BigChoice
          icon={<Star className="h-5 w-5 text-pink-500" />}
          label="Marktleiter will persönliches Gespräch"
          subLabel="Markt wird markiert, ein Kollege übernimmt"
          onClick={() => onSubmit({ type: "visit", result: "escalation" })}
          disabled={pending}
        />
        <BigChoice
          icon={<MapPin className="h-5 w-5 text-orange-500" />}
          label="Niemand angetroffen"
          subLabel="3 Tage Pause"
          onClick={() => onSubmit({ type: "visit", result: "no_contact" })}
          disabled={pending}
        />
        <BigChoice
          icon={<Ban className="h-5 w-5 text-red-500" />}
          label="Final abgelehnt"
          subLabel="30 Tage Pause"
          onClick={() => {
            if (
              confirm(
                "Sicher? Markt wird 30 Tage gesperrt.",
              )
            )
              onSubmit({ type: "visit", result: "declined" });
          }}
          disabled={pending}
        />
      </div>
    </Dialog>
  );
}

function ControlDialog({
  open,
  onClose,
  onSubmit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: ActionInput) => void;
  pending: boolean;
}) {
  const [problemText, setProblemText] = useState("");
  return (
    <Dialog open={open} title="Wie sieht der Markt aus?" onClose={onClose}>
      <div className="space-y-3">
        <BigChoice
          icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
          label="Alles okay"
          subLabel="Markt wird 21 Tage Ruhe haben"
          onClick={() => onSubmit({ type: "control", result: "ok" })}
          disabled={pending}
        />
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="mb-2 text-sm font-medium">Problem gefunden:</p>
          <textarea
            value={problemText}
            onChange={(e) => setProblemText(e.target.value)}
            placeholder="Was ist das Problem? (Pflicht)"
            className="block w-full rounded-lg border border-gray-300 p-2 text-sm"
            rows={3}
          />
          <button
            disabled={pending || problemText.trim().length === 0}
            onClick={() =>
              onSubmit({
                type: "control",
                result: "problem",
                payload: { problem_description: problemText.trim() },
              })
            }
            className="mt-2 flex min-h-12 w-full items-center justify-center rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            Problem melden
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function CancelOrderDialog({
  open,
  onClose,
  onSubmit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: ActionInput) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} title="Bestellung stornieren" onClose={onClose}>
      <p className="mb-3 text-sm text-gray-600">
        Bitte erkläre kurz, warum die Bestellung storniert wird.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Grund (Pflicht)"
        className="block w-full rounded-lg border border-gray-300 p-2 text-sm"
        rows={3}
      />
      <button
        disabled={pending || reason.trim().length === 0}
        onClick={() =>
          onSubmit({
            type: "cancel_order",
            payload: { reason: reason.trim() },
          })
        }
        className="mt-3 flex min-h-12 w-full items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        Bestellung stornieren
      </button>
    </Dialog>
  );
}

function ManualOverrideDialog({
  open,
  onClose,
  onSubmit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: ActionInput) => void;
  pending: boolean;
}) {
  const [target, setTarget] = useState<string>("gruen");
  const [reason, setReason] = useState("");
  const targets: { value: string; label: string }[] = [
    { value: "gruen", label: "Grün — frei" },
    { value: "gelb", label: "Gelb — wartet auf Lieferung" },
    { value: "orange", label: "Orange — Kontrolle nötig" },
    { value: "rosa", label: "Rosa — persönliches Gespräch nötig" },
    { value: "rot", label: "Rot — gesperrt (ohne Cooldown!)" },
    { value: "grau", label: "Grau — inaktiv" },
  ];
  return (
    <Dialog open={open} title="Status überschreiben (Admin)" onClose={onClose}>
      <p className="mb-3 text-sm text-gray-600">
        Diese Aktion wird im Audit-Log festgehalten.
      </p>
      <label className="block text-sm font-medium text-gray-700">Neuer Status</label>
      <select
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="mt-1 block w-full min-h-12 rounded-lg border border-gray-300 px-3 text-sm"
      >
        {targets.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <label className="mt-3 block text-sm font-medium text-gray-700">
        Grund (wird gespeichert)
      </label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="z. B. Korrektur einer Fehlerfassung"
        className="mt-1 block w-full rounded-lg border border-gray-300 p-2 text-sm"
        rows={3}
      />
      <button
        disabled={pending || reason.trim().length === 0}
        onClick={() =>
          onSubmit({
            type: "manual_override",
            payload: { target_status: target, reason: reason.trim() },
          })
        }
        className="mt-3 flex min-h-12 w-full items-center justify-center rounded-lg bg-gray-800 px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        Status setzen
      </button>
    </Dialog>
  );
}

function BigChoice({
  icon,
  label,
  subLabel,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  subLabel?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-gray-200 px-3 text-left hover:bg-gray-50 disabled:opacity-50"
    >
      {icon}
      <span>
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        {subLabel && (
          <span className="block text-xs text-gray-500">{subLabel}</span>
        )}
      </span>
    </button>
  );
}

// =============================================================================
// Error-Übersetzung
// =============================================================================
function translateError(err: ApiError): string {
  const map: Record<string, string> = {
    MARKET_HAS_ACTIVE_VORGANG: "Markt hat einen aktiven Vorgang — Aktion gerade nicht möglich.",
    MARKET_IN_COOLDOWN: "Markt ist gerade im Cooldown.",
    MARKET_MERGED: "Markt wurde mit einem anderen zusammengeführt.",
    MARKET_INACTIVE: "Markt ist inaktiv.",
    MARKET_GREEN_INVALID_ACTION: "Auf einem freien Markt ist nur ein Besuch erlaubt.",
    USER_DEACTIVATED: "Dein Zugang ist nicht aktiv. Bitte den Admin kontaktieren.",
    FIELD_USER_NOT_ALLOWED: "Diese Aktion ist nur für Admins erlaubt.",
    RESERVATION_EXISTS: "Markt ist schon reserviert.",
    RESERVATION_NOT_ALLOWED_FOR_STATUS: "Dieser Markt kann gerade nicht reserviert werden.",
    DUPLICATE_CLIENT_ID: "Diese Aktion wurde schon gespeichert.",
    VALIDATION_FAILED: err.message,
  };
  return map[err.code] ?? err.message ?? "Es ist etwas schief gelaufen.";
}
