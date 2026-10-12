// Frontend-API-Client für Märkte.
// Wird in Server Components und Client Components verwendet — fetch ist
// universell, aber für Client-Components nutzen wir relative URLs.

import type {
  MarketStatus,
  CurrentSolution,
  CustomerSatisfaction,
  SalesStage,
} from "@/lib/db/schema";

export interface MarketListItemApi {
  id: string;
  name: string;
  gln: string | null;
  chain: { id: string; name: string } | null;
  streetFull: string;
  postalCode: string | null;
  city: string | null;
  district: string | null;
  lat: number | null;
  lng: number | null;
  computedStatus: MarketStatus;
  reservedByUserId: string | null;
  reservationValidUntil: string | null;
  cooldownUntil: string | null;
  lastActionAt: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  currentSolution: CurrentSolution;
  satisfaction: CustomerSatisfaction;
  createdAt: string;
}

export interface MarketListResponse {
  items: MarketListItemApi[];
  next_cursor: string | null;
}

export interface MarketMapMarkerApi {
  id: string;
  name: string;
  streetFull: string;
  district: string | null;
  lat: number;
  lng: number;
  computedStatus: MarketStatus;
  reservedByUserId: string | null;
  assignedUserId: string | null;
}

export interface MarketMapResponse {
  items: MarketMapMarkerApi[];
}

export interface MarketDetailApi extends MarketListItemApi {
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  updatedAt: string;
  salesStage: SalesStage;
  salesValue: number | null;
  expectedVolume: number | null;
  probability: number | null;
  leadSource: string | null;
  clientType: string | null;
  channel: string | null;
  dateEntered: string | null;
  expectedClose: string | null;
  lastActivityAt: string | null;
  nextAction: string | null;
  importedNotes: string | null;
  noContact: boolean;
  noContactAt: string | null;
  assignedUser: { id: string; name: string; email: string } | null;
  nextFollowUp: {
    id: string;
    dueAt: string;
    userId: string;
    userName: string;
  } | null;
  lastAction: {
    id: string;
    type: string;
    result: string | null;
    resultingStatus: string;
    cooldownUntil: string | null;
    userId: string;
    userName: string;
    contactType: string | null;
    interestLevel: string | null;
    createdAt: string;
    payload: Record<string, unknown>;
  } | null;
}

export interface MarketListFiltersClient {
  status?: MarketStatus[];
  chainId?: string;
  district?: string;
  search?: string;
  lastContact?: "never" | "today" | "7d" | "30d" | "older_than_30d";
  contactType?: "visit" | "phone" | "email" | "other";
  reservedByMe?: boolean;
  assignedToMe?: boolean;
  assignedUserId?: string;
  limit?: number;
  cursor?: string;
}

export function buildMarketsUrl(f: MarketListFiltersClient): string {
  const params = new URLSearchParams();
  if (f.status && f.status.length > 0) params.set("status", f.status.join(","));
  if (f.chainId) params.set("chain_id", f.chainId);
  if (f.district) params.set("district", f.district);
  if (f.search) params.set("search", f.search);
  if (f.lastContact) params.set("last_contact", f.lastContact);
  if (f.contactType) params.set("contact_type", f.contactType);
  if (f.reservedByMe) params.set("reserved_by_me", "true");
  if (f.assignedToMe) params.set("assigned_to_me", "true");
  if (f.assignedUserId) params.set("assigned_user_id", f.assignedUserId);
  if (f.limit) params.set("limit", String(f.limit));
  if (f.cursor) params.set("cursor", f.cursor);
  const qs = params.toString();
  return `/api/v1/markets${qs ? `?${qs}` : ""}`;
}

export async function fetchMarkets(
  filters: MarketListFiltersClient = {},
): Promise<MarketListResponse> {
  const res = await fetch(buildMarketsUrl(filters), { credentials: "include" });
  if (!res.ok) throw new Error(`Markt-Liste fehlgeschlagen (${res.status})`);
  const json = await res.json();
  return json.data as MarketListResponse;
}

export async function fetchMarketMap(
  filters: MarketListFiltersClient = {},
): Promise<MarketMapResponse> {
  const params = new URLSearchParams();
  if (filters.status?.length) params.set("status", filters.status.join(","));
  if (filters.chainId) params.set("chain_id", filters.chainId);
  if (filters.district) params.set("district", filters.district);
  if (filters.search) params.set("search", filters.search);
  if (filters.lastContact) params.set("last_contact", filters.lastContact);
  if (filters.contactType) params.set("contact_type", filters.contactType);
  if (filters.reservedByMe) params.set("reserved_by_me", "true");
  if (filters.assignedToMe) params.set("assigned_to_me", "true");
  if (filters.assignedUserId) params.set("assigned_user_id", filters.assignedUserId);
  const query = params.toString();
  const res = await fetch("/api/v1/markets/map" + (query ? "?" + query : ""), { credentials: "include" });
  if (!res.ok) throw new Error(`Markt-Karte fehlgeschlagen (${res.status})`);
  const json = await res.json();
  return json.data as MarketMapResponse;
}

export async function fetchMarketDetail(id: string): Promise<MarketDetailApi> {
  const res = await fetch(`/api/v1/markets/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Markt-Detail fehlgeschlagen (${res.status})`);
  const json = await res.json();
  return json.data as MarketDetailApi;
}
