"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export function DeleteCustomerButton({ marketId, name }: { marketId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/admin/customers/${marketId}`, { method: "DELETE", credentials: "include" });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error?.message ?? "Firma konnte nicht gelöscht werden.");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50">
        <Trash2 className="h-4 w-4" /> Firma löschen
      </button>
      {open && (
        <div className="fixed inset-0 z-[1200] flex items-end bg-slate-950/35 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="delete-customer-title">
          <div className="w-full rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-sm sm:rounded-2xl">
            <h2 id="delete-customer-title" className="text-lg font-semibold text-slate-950">Firma löschen?</h2>
            <p className="mt-2 text-sm text-slate-600">Diese Firma und ihre zugehörigen CRM-Daten werden dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.</p>
            <p className="mt-2 text-sm font-medium text-slate-900">{name}</p>
            {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="mt-5 flex gap-2">
              <button disabled={deleting} onClick={() => setOpen(false)} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700">Abbrechen</button>
              <button disabled={deleting} onClick={() => void remove()} className="min-h-11 flex-1 rounded-lg bg-red-700 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60">{deleting ? "Löscht …" : "Löschen"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
