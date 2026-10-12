// Status-Berechnung — Single Source of Truth.
// Es gibt KEINE SQL-Funktion compute_resulting_status. Diese Datei ist die
// einzige Implementierung. View v_market_status nutzt die hier gespeicherten
// Snapshots, berechnet aber nicht selbst.
//
// Siehe docs/Reference.md für die kanonische Übersicht.

import type {
  ActionTypeValue,
  ActionResultValue,
  MarketStatus,
} from "@/lib/db/schema";

export class InvalidActionCombinationError extends Error {
  constructor(
    public readonly type: ActionTypeValue,
    public readonly result: ActionResultValue | null,
  ) {
    super(`Invalid action combination: type=${type}, result=${result}`);
    this.name = "InvalidActionCombinationError";
  }
}

export class MissingTargetStatusError extends Error {
  constructor() {
    super("manual_override requires payload.target_status");
    this.name = "MissingTargetStatusError";
  }
}

export class InvalidTargetStatusError extends Error {
  constructor(public readonly value: string) {
    super(
      `Invalid target_status '${value}'. Must be one of gruen, gelb, orange, rosa, rot, grau (not blau).`,
    );
    this.name = "InvalidTargetStatusError";
  }
}

const VALID_OVERRIDE_TARGETS: readonly MarketStatus[] = [
  "gruen",
  "gelb",
  "orange",
  "rosa",
  "rot",
  "grau",
];

export function computeResultingStatus(
  type: ActionTypeValue,
  result: ActionResultValue | null,
  targetStatus?: string | null,
): MarketStatus {
  if (type === "manual_override") {
    if (!targetStatus) throw new MissingTargetStatusError();
    if (!(VALID_OVERRIDE_TARGETS as readonly string[]).includes(targetStatus)) {
      throw new InvalidTargetStatusError(targetStatus);
    }
    return targetStatus as MarketStatus;
  }

  if (type === "visit") {
    switch (result) {
      case "success":
        return "gelb";
      case "escalation":
        return "rosa";
      case "no_contact":
      case "declined":
        return "rot";
    }
  }

  if (type === "profi_visit") {
    switch (result) {
      case "success":
        return "gelb";
      case "declined":
        return "rot";
    }
  }

  if (type === "delivery" && result === null) return "orange";

  if (type === "control") {
    if (result === "ok") return "rot";
    if (result === "problem") return "gelb";
  }

  if (type === "cancel_order" && result === null) return "gruen";

  throw new InvalidActionCombinationError(type, result);
}
