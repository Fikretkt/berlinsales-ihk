"use client";

import { useEffect, useState } from "react";
import type { MarketMapMarkerApi } from "@/lib/markets/api-client";
import { StatusBadge } from "./StatusBadge";

export function MarketBottomSheet({
  market,
  onClose,
  onOpenDetail,
}: {
  market: MarketMapMarkerApi | null;
  onClose: () => void;
  onOpenDetail: (id: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || !market) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[1000] mx-auto max-w-md rounded-t-2xl bg-white p-4 shadow-2xl ring-1 ring-gray-200">
      <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-gray-300" />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{market.name}</h2>
          <p className="text-sm text-gray-600">{market.streetFull}{market.district && ", " + market.district}</p>
        </div>
        <button onClick={onClose} className="flex min-h-10 min-w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="Schließen">×</button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <StatusBadge status={market.computedStatus} />
      </div>
      <button
        onClick={() => onOpenDetail(market.id)}
        className="mt-4 flex min-h-12 w-full items-center justify-center rounded-lg bg-blue-800 px-4 text-base font-semibold text-white hover:bg-blue-900"
      >
        Kundendetails öffnen
      </button>
    </div>
  );
}
