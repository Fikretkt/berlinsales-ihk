"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Info } from "lucide-react";

interface Rule {
  id: string;
  action_type: string;
  result: string | null;
  duration_days: number;
  updated_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  visit: "Besuch",
  profi_visit: "Persönliches Gespräch",
  delivery: "Lieferung",
  control: "Kontrolle",
  cancel_order: "Stornierung",
};

const RESULT_LABELS: Record<string, string> = {
  success: "erfolgreich",
  escalation: "Persönliches Gespräch nötig",
  declined: "abgelehnt",
  no_contact: "nicht angetroffen",
  ok: "okay",
  problem: "Problem",
};

async function fetchRules(): Promise<Rule[]> {
  const res = await fetch("/api/v1/admin/cooldown-rules", { credentials: "include" });
  if (!res.ok) throw new Error("Fehler");
  return (await res.json()).data.items;
}

export default function CooldownsPage() {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, number>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["cooldown-rules"],
    queryFn: fetchRules,
  });

  async function save(rule: Rule) {
    const newVal = drafts[rule.id];
    if (newVal === undefined || newVal === rule.duration_days) return;
    const res = await fetch(`/api/v1/admin/cooldown-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ duration_days: newVal }),
    });
    if (!res.ok) {
      const j = await res.json();
      alert(j.error?.message ?? "Fehler beim Speichern");
      return;
    }
    setDrafts((d) => {
      const next = { ...d };
      delete next[rule.id];
      return next;
    });
    qc.invalidateQueries({ queryKey: ["cooldown-rules"] });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Cooldowns konfigurieren</h1>

      <div className="flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <strong>Wichtig:</strong> Änderungen wirken nur auf zukünftige Aktionen. Bestehende
          Cooldowns laufen mit dem Wert weiter, der zum Zeitpunkt der Aktion galt.
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-3 text-left">Aktion</th>
              <th className="px-3 py-3 text-left">Ergebnis</th>
              <th className="px-3 py-3 text-left">Sperr-Dauer (Tage)</th>
              <th className="px-3 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                  Lädt …
                </td>
              </tr>
            )}
            {data?.map((rule) => {
              const draftValue = drafts[rule.id] ?? rule.duration_days;
              const isDirty = drafts[rule.id] !== undefined && drafts[rule.id] !== rule.duration_days;
              return (
                <tr key={rule.id}>
                  <td className="px-3 py-3 font-medium">
                    {ACTION_LABELS[rule.action_type] ?? rule.action_type}
                  </td>
                  <td className="px-3 py-3 text-gray-600">
                    {rule.result ? RESULT_LABELS[rule.result] ?? rule.result : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={365}
                        value={draftValue}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [rule.id]: Math.max(0, Math.min(365, parseInt(e.target.value || "0", 10))),
                          }))
                        }
                        className="w-24 min-h-10 rounded-lg border border-gray-300 px-2 text-sm"
                      />
                      <span className="text-xs text-gray-500">
                        {draftValue === 0 ? "kein Cooldown" : `${draftValue} Tage`}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      onClick={() => save(rule)}
                      disabled={!isDirty}
                      className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white disabled:bg-gray-200 disabled:text-gray-400"
                    >
                      <Save className="h-3 w-3" /> Speichern
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
