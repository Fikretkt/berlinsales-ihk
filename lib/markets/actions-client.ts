// Client-API für Aktionen und Reservierungen.

export interface ActionInput {
  type: "visit" | "profi_visit" | "delivery" | "control" | "cancel_order" | "manual_override";
  result?: "success" | "escalation" | "declined" | "no_contact" | "ok" | "problem" | null;
  geo_lat?: number | null;
  geo_lng?: number | null;
  payload?: Record<string, unknown>;
}

export interface ActionResultApi {
  action_id: string;
  new_status:
    | "gruen"
    | "blau"
    | "gelb"
    | "orange"
    | "rosa"
    | "rot"
    | "grau";
  cooldown_until: string | null;
  distance_meters: number | null;
  distance_warning: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  details?: { merged_into_id?: string } & Record<string, unknown>;
}

export async function postAction(
  marketId: string,
  input: ActionInput,
): Promise<{ ok: true; data: ActionResultApi } | { ok: false; error: ApiError }> {
  const res = await fetch(`/api/v1/markets/${marketId}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok) return { ok: false, error: json.error };
  return { ok: true, data: json.data };
}

export async function postReserve(
  marketId: string,
): Promise<
  | { ok: true; data: { reservation_id: string; valid_until: string } }
  | { ok: false; error: ApiError }
> {
  const res = await fetch(`/api/v1/markets/${marketId}/reserve`, {
    method: "POST",
    credentials: "include",
  });
  const json = await res.json();
  if (!res.ok) return { ok: false, error: json.error };
  return { ok: true, data: json.data };
}

export async function deleteReserve(
  marketId: string,
): Promise<{ ok: true } | { ok: false; error: ApiError }> {
  const res = await fetch(`/api/v1/markets/${marketId}/reserve`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const json = await res.json();
    return { ok: false, error: json.error };
  }
  return { ok: true };
}
