"use client";

import Link from "next/link";
import { ChevronRight, Calendar, UserCheck } from "lucide-react";
import type { MarketListItemApi } from "@/lib/markets/api-client";
import { StatusBadge } from "./StatusBadge";

export function MarketsList({ markets }: { markets: MarketListItemApi[] }) {
  if (!markets.length) {
    return <div className="p-8 text-center text-sm text-gray-500">Keine Kunden für diese Filter gefunden.</div>;
  }
  return (
    <ul className="divide-y divide-gray-100">
      {markets.map((customer) => (
        <li key={customer.id}>
          <Link href={"/markets/" + customer.id} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-gray-50">
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-medium text-gray-900">{customer.name}</div>
              <div className="truncate text-xs text-gray-500">
                {customer.streetFull || [customer.postalCode, customer.city].filter(Boolean).join(" ") || "Adresse nicht importiert"}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StatusBadge status={customer.computedStatus === "gruen" && customer.reservedByUserId ? "blau" : customer.computedStatus} size="sm" />
                {customer.reservedByUserId && customer.computedStatus !== "gruen" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"><Calendar className="h-3 w-3" /> Reserviert</span>
                )}
                {customer.assignedUserName && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    <UserCheck className="h-3 w-3" /> {customer.assignedUserName}
                  </span>
                )}
                {customer.chain && <span className="text-xs text-gray-400">{customer.chain.name}</span>}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-gray-300" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
