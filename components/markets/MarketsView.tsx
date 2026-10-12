"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Map as MapIcon, List as ListIcon, Plus } from "lucide-react";
import { fetchMarketMap, fetchMarkets, type MarketMapMarkerApi } from "@/lib/markets/api-client";
import { MarketsFilters, type FiltersState } from "./MarketsFilters";
import { MarketsList } from "./MarketsList";
import { MarketBottomSheet } from "./MarketBottomSheet";
import { NewCustomerDialog } from "./NewCustomerDialog";

const MarketMap = dynamic(() => import("./MarketMap").then((module) => module.MarketMap), {
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center bg-gray-100 text-sm text-gray-500">Kundenkarte wird geladen ...</div>,
});
type ViewMode = "map" | "list";

export function MarketsView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialAssignedToMe =
    searchParams.get("assigned_to_me") === "true" ||
    searchParams.get("assignedToMe") === "true";
  const initialAssignedUserId = searchParams.get("assigned_user_id") || undefined;
  const initialView: ViewMode = searchParams.get("view") === "list" ? "list" : "map";

  const [view, setView] = useState<ViewMode>(initialView);
  const [filters, setFilters] = useState<FiltersState>({
    search: "",
    status: [],
    district: "",
    lastContact: "",
    contactType: "",
    reservedByMe: false,
    assignedToMe: initialAssignedToMe,
  });
  const [selected, setSelected] = useState<MarketMapMarkerApi | null>(null);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const filterRequest = {
    search: filters.search || undefined,
    status: filters.status.length ? filters.status : undefined,
    district: filters.district || undefined,
    lastContact: filters.lastContact || undefined,
    contactType: filters.contactType || undefined,
    reservedByMe: filters.reservedByMe,
    assignedToMe: filters.assignedToMe,
    assignedUserId: initialAssignedUserId,
  };
  const listQuery = useQuery({
    queryKey: ["markets", filters],
    queryFn: () => fetchMarkets({ ...filterRequest, limit: 50 }),
    enabled: view === "list",
    refetchInterval: 4000,
    refetchOnWindowFocus: true,
  });
  const mapQuery = useQuery({
    queryKey: ["market-map", filters],
    queryFn: () => fetchMarketMap(filterRequest),
    enabled: view === "map",
    refetchInterval: 4000,
    refetchOnWindowFocus: true,
  });
  const activeQuery = view === "map" ? mapQuery : listQuery;
  const customerCount = view === "map" ? mapQuery.data?.items.length ?? 0 : listQuery.data?.items.length ?? 0;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <MarketsFilters value={filters} onChange={setFilters} />
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2 text-sm text-gray-600">
        <div>{activeQuery.isLoading ? "Lade ..." : activeQuery.error ? "Fehler beim Laden" : new Intl.NumberFormat("de-DE").format(customerCount) + " Kunden"}</div>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          <button onClick={() => setView("map")} className={"flex items-center gap-1 rounded-md px-3 py-1 text-sm font-medium " + (view === "map" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600")} aria-pressed={view === "map"}>
            <MapIcon className="h-4 w-4" /> Kundenkarte
          </button>
          <button onClick={() => setView("list")} className={"flex items-center gap-1 rounded-md px-3 py-1 text-sm font-medium " + (view === "list" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600")} aria-pressed={view === "list"}>
            <ListIcon className="h-4 w-4" /> Liste
          </button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-auto">
        {view === "map" ? <MarketMap markets={mapQuery.data?.items ?? []} onSelect={setSelected} /> : <MarketsList markets={listQuery.data?.items ?? []} />}
        {view === "map" && (
          <button onClick={() => setCreatingCustomer(true)} className="absolute right-4 top-4 z-[900] inline-flex min-h-11 items-center gap-2 rounded-full bg-blue-800 px-4 text-sm font-semibold text-white shadow-lg hover:bg-blue-900">
            <Plus className="h-4 w-4" /> Neue Firma
          </button>
        )}
        {activeQuery.error && (
          <div role="alert" className="absolute inset-x-4 top-4 z-[800] rounded-xl bg-red-50 p-4 text-center text-sm text-red-800 shadow-sm ring-1 ring-red-200">
            Kunden konnten nicht geladen werden.
            <button onClick={() => void activeQuery.refetch()} className="ml-2 min-h-10 font-semibold underline">Erneut versuchen</button>
          </div>
        )}
        {!activeQuery.isLoading && !activeQuery.error && customerCount === 0 && (
          <div className="absolute inset-x-4 top-4 rounded-xl bg-white p-4 text-center text-sm text-gray-600 shadow-sm ring-1 ring-gray-200">
            Keine Kunden für diese Filter gefunden.
            <button onClick={() => setFilters({ search: "", status: [], district: "", chainId: "", lastContact: "", contactType: "", reservedByMe: false, assignedToMe: false })} className="ml-2 font-semibold text-blue-800 underline">Filter zurücksetzen</button>
          </div>
        )}
        <MarketBottomSheet market={selected} onClose={() => setSelected(null)} onOpenDetail={(id) => router.push("/markets/" + id)} />
        {creatingCustomer && <NewCustomerDialog onClose={() => setCreatingCustomer(false)} onCreated={() => {
          setCreatingCustomer(false);
          void mapQuery.refetch();
          void listQuery.refetch();
        }} />}
      </div>
    </div>
  );
}
