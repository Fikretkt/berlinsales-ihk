// Einheitliches Response-Format laut API-Spec § Globale Konventionen.

import { NextResponse } from "next/server";
import { HttpError } from "@/lib/http/errors";

export interface ApiError {
  code: string;
  message: string;
  field?: string;
  details?: unknown;
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data, error: null }, { status });
}

export function fail(error: ApiError, status: number) {
  return NextResponse.json({ data: null, error }, { status });
}

export function validationFailed(message: string, field?: string) {
  return fail(
    { code: "VALIDATION_FAILED", message, ...(field ? { field } : {}) },
    400,
  );
}

// Wandelt HttpError aus session.ts in eine Response um.
export function fromHttpError(err: HttpError) {
  return fail(
    {
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    },
    err.status,
  );
}

// Convenience-Wrapper für Route-Handler. Fängt HttpError + Postgres-Fehler.
export async function withErrorHandler<T>(
  fn: () => Promise<T>,
): Promise<T | Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) return fromHttpError(err);
    // Database drivers can include SQL and bound values in errors. Keep the
    // server log useful without recording customer data or implementation detail.
    console.error("Unhandled request error", {
      name: err instanceof Error ? err.name : "UnknownError",
      code: typeof err === "object" && err !== null && "code" in err
        ? String((err as { code: unknown }).code)
        : undefined,
    });
    return fail({ code: "INTERNAL_ERROR", message: "Interner Fehler" }, 500);
  }
}
