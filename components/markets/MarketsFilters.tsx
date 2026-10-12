"use client";

import { Check, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { MarketStatus } from "@/lib/db/schema";
import { STATUS_DISPLAY } from "@/lib/markets/status-display";

const STATUS_OPTIONS: MarketStatus[] = ["gruen", "blau", "gelb", "orange", "rosa", "rot"];
const LAST_CONTACT_OPTIONS = [
  ["", "Alle"], ["never", "Noch nie kontaktiert"], ["today", "Heute"],
  ["7d", "Letzte 7 Tage"], ["30d", "Letzte 30 Tage"], ["older_than_30d", "Älter als 30 Tage"],
] as const;
const CONTACT_OPTIONS = [
  ["", "Alle Kontaktarten"], ["visit", "Vor-Ort-Besuch"], ["phone", "Telefonat"],
  ["email", "E-Mail"], ["other", "Sonstiges"],
] as const;

export interface FiltersState {
  search: string;
  status: MarketStatus[];
  district: string;
  chainId?: string;
  lastContact: "" | "never" | "today" | "7d" | "30d" | "older_than_30d";
  contactType: "" | "visit" | "phone" | "email" | "other";
  reservedByMe: boolean;
  assignedToMe: boolean;
}

const EMPTY_FILTERS: Omit<FiltersState, "search"> = {
  status: [],
  district: "",
  lastContact: "",
  contactType: "",
  reservedByMe: false,
  assignedToMe: false,
};

export function MarketsFilters({ value, onChange }: {
  value: FiltersState;
  onChange: (next: FiltersState) => void;
}) {
  const [localSearch, setLocalSearch] = useState(value.search);
  const [open, setOpen] = useState(false);
  const [districts, setDistricts] = useState<string[]>([]);
  useEffect(() => { setLocalSearch(value.search); }, [value.search]);
  useEffect(() => {
    fetch("/api/v1/markets/filter-options", { credentials: "include" })
      .then((response) => response.ok ? response.json() : null)
      .then((json) => json && setDistricts(json.data.districts))
      .catch(() => {});
  }, []);

  const activeCount =
    value.status.length +
    Number(Boolean(value.district)) +
    Number(Boolean(value.lastContact)) +
    Number(Boolean(value.contactType)) +
    Number(value.reservedByMe) +
    Number(value.assignedToMe);
  const update = (patch: Partial<FiltersState>) => onChange({ ...value, ...patch });
  const toggleStatus = (status: MarketStatus) => update({
    status: value.status.includes(status)
      ? value.status.filter((item) => item !== status)
      : [...value.status, status],
  });
  const reset = () => { setLocalSearch(""); onChange({ search: "", ...EMPTY_FILTERS }); };

  return (
    <div className="border-b border-gray-200 bg-white px-4 py-2">
      <form onSubmit={(event) => { event.preventDefault(); update({ search: localSearch.trim() }); }} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="search" value={localSearch} onChange={(event) => setLocalSearch(event.target.value)}
            placeholder="Kunden suchen ..." className="block min-h-11 w-full rounded-lg border border-gray-300 pl-9 pr-3 text-base focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700" />
        </div>
        <button type="button" onClick={() => setOpen(true)}
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-900 md:hidden">
          <SlidersHorizontal className="h-4 w-4" /> Filter{activeCount ? " (" + activeCount + ")" : ""}
        </button>
      </form>
      <div className="mt-2 hidden gap-2 md:grid md:grid-cols-2 lg:grid-cols-3">
        <FilterControls value={value} districts={districts} onChange={update} onToggleStatus={toggleStatus} />
      </div>
      {activeCount > 0 && (
        <button type="button" onClick={reset} className="mt-1 text-xs font-medium text-blue-800 hover:underline">Zurücksetzen ({activeCount})</button>
      )}
      {open && (
        <div className="fixed inset-0 z-[1100] bg-black/30 md:hidden" role="dialog" aria-modal="true" aria-label="Kundenfilter">
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white px-4 pb-4 pt-3 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-900">Kunden filtern</h2>
                {activeCount > 0 && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-900">
                    {activeCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {activeCount > 0 && (
                  <button type="button" onClick={reset} className="text-xs font-medium text-blue-800 hover:underline">
                    Zurücksetzen
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="flex min-h-9 min-w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="Schließen"><X className="h-5 w-5" /></button>
              </div>
            </div>
            <div className="space-y-3">
              <FilterControls value={value} districts={districts} onChange={update} onToggleStatus={toggleStatus} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterControls({ value, districts, onChange, onToggleStatus }: {
  value: FiltersState;
  districts: string[];
  onChange: (patch: Partial<FiltersState>) => void;
  onToggleStatus: (status: MarketStatus) => void;
}) {
  return (
    <>
      <StatusSelector selected={value.status} onToggle={onToggleStatus} />
      <label className="text-sm font-semibold text-gray-800">
        Bezirk
        <select value={value.district} onChange={(event) => onChange({ district: event.target.value })} className="mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-base">
          <option value="">Alle Bezirke</option>
          {districts.map((district) => <option key={district} value={district}>{district}</option>)}
        </select>
      </label>
      <label className="text-sm font-semibold text-gray-800">
        Letzter Kontakt
        <select value={value.lastContact} onChange={(event) => onChange({ lastContact: event.target.value as FiltersState["lastContact"] })} className="mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-base">
          {LAST_CONTACT_OPTIONS.map(([item, label]) => <option key={item} value={item}>{label}</option>)}
        </select>
      </label>
      <label className="text-sm font-semibold text-gray-800">
        Kontaktart
        <select value={value.contactType} onChange={(event) => onChange({ contactType: event.target.value as FiltersState["contactType"] })} className="mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-base">
          {CONTACT_OPTIONS.map(([item, label]) => <option key={item} value={item}>{label}</option>)}
        </select>
      </label>
      <label className="flex min-h-11 items-center gap-3 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-800">
        <input type="checkbox" checked={value.reservedByMe} onChange={(event) => onChange({ reservedByMe: event.target.checked })} className="h-5 w-5" />
        Für mich reserviert
      </label>
      <label className="flex min-h-11 items-center gap-3 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-800">
        <input type="checkbox" checked={value.assignedToMe} onChange={(event) => onChange({ assignedToMe: event.target.checked })} className="h-5 w-5" />
        Für mich zugewiesen
      </label>
    </>
  );
}

function StatusSelector({ selected, onToggle }: {
  selected: MarketStatus[];
  onToggle: (status: MarketStatus) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const firstSelected = selected[0];

  const summary =
    selected.length === 0
      ? "Alle Status"
      : selected.length === 1 && firstSelected
        ? STATUS_DISPLAY[firstSelected].label
        : `${selected.length} Status ausgewählt`;

  return (
    <div className="relative">
      <p className="mb-1 text-sm font-semibold text-gray-800">Kundenstatus</p>
      <button type="button" onClick={() => setExpanded(!expanded)} className="flex min-h-11 w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 text-left text-base" aria-expanded={expanded} aria-haspopup="listbox">
        <span className="truncate">{summary}</span>
        <ChevronDown className={"h-4 w-4 shrink-0 text-gray-500 transition-transform " + (expanded ? "rotate-180" : "")} />
      </button>
      {expanded && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
          <div className="grid grid-cols-2 gap-1">
            {STATUS_OPTIONS.map((status) => {
              const active = selected.includes(status);
              const display = STATUS_DISPLAY[status];
              return <button key={status} type="button" onClick={() => onToggle(status)}
                className={"flex min-h-10 items-center gap-2 rounded-lg px-2 text-left text-sm " + (active ? "bg-blue-50 font-medium text-blue-950" : "text-gray-700 hover:bg-gray-50")}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: display.color }} />
                <span className="flex-1 truncate">{display.label}</span>
                {active && <Check className="h-4 w-4 shrink-0 text-blue-800" />}
              </button>;
            })}
          </div>
          <button type="button" onClick={() => setExpanded(false)} className="mt-1 min-h-9 w-full rounded-lg text-sm font-semibold text-blue-800 hover:bg-blue-50">Fertig</button>
        </div>
      )}
    </div>
  );
}
