"use client";

// Notizen-Panel auf der Detail-Seite: chronologische Liste + Eingabefeld.
// Eigene Notizen sind 24h editierbar.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Check, X, MessageSquarePlus } from "lucide-react";
import { formatBerlinDateTime } from "@/lib/markets/status-display";

interface Note {
  id: string;
  marketId: string;
  content: string;
  userId: string;
  userName: string;
  createdAt: string;
  editableUntil: string;
  isEditable: boolean;
}

async function fetchNotes(marketId: string): Promise<Note[]> {
  const res = await fetch(`/api/v1/markets/${marketId}/notes`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Fehler");
  return (await res.json()).data.items;
}

export function NotesPanel({ marketId }: { marketId: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["notes", marketId],
    queryFn: () => fetchNotes(marketId),
  });

  async function submitNew() {
    if (!draft.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/markets/${marketId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: draft.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Konnte Notiz nicht speichern");
        return;
      }
      setDraft("");
      qc.invalidateQueries({ queryKey: ["notes", marketId] });
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit(noteId: string) {
    if (!editDraft.trim()) return;
    const res = await fetch(`/api/v1/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ content: editDraft.trim() }),
    });
    if (!res.ok) {
      const j = await res.json();
      alert(j.error?.message ?? "Fehler");
      return;
    }
    setEditingId(null);
    setEditDraft("");
    qc.invalidateQueries({ queryKey: ["notes", marketId] });
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <h2 className="mb-3 text-base font-semibold">Notizen</h2>

      {/* Neue Notiz */}
      <div className="mb-4 rounded-lg border border-gray-200 p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Notiz schreiben (z. B. Ansprechpartner, Besonderheiten, Liefer-Hinweise)"
          rows={3}
          className="block w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-gray-500">24 Stunden lang nach dem Speichern editierbar.</p>
          <button
            onClick={submitNew}
            disabled={submitting || draft.trim().length === 0}
            className="flex min-h-10 items-center gap-1 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            <MessageSquarePlus className="h-4 w-4" />
            {submitting ? "Speichert …" : "Speichern"}
          </button>
        </div>
      </div>

      {/* Liste */}
      {isLoading && <p className="text-sm text-gray-500">Lädt …</p>}
      {data && data.length === 0 && (
        <p className="text-sm italic text-gray-500">Noch keine Notizen.</p>
      )}
      <ul className="space-y-3">
        {data?.map((n) => (
          <li key={n.id} className="rounded-lg border border-gray-100 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs text-gray-500">
                <strong className="text-gray-700">{n.userName}</strong> ·{" "}
                {formatBerlinDateTime(n.createdAt)}
              </div>
              {n.isEditable && editingId !== n.id && (
                <button
                  onClick={() => {
                    setEditingId(n.id);
                    setEditDraft(n.content);
                  }}
                  className="flex min-h-8 items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                  aria-label="Bearbeiten"
                >
                  <Pencil className="h-3 w-3" /> Bearbeiten
                </button>
              )}
            </div>
            {editingId === n.id ? (
              <div className="mt-2">
                <textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  rows={3}
                  className="block w-full rounded-lg border border-gray-300 p-2 text-sm"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => saveEdit(n.id)}
                    className="flex min-h-8 items-center gap-1 rounded-lg bg-green-600 px-2 py-1 text-xs font-semibold text-white"
                  >
                    <Check className="h-3 w-3" /> Speichern
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(null);
                      setEditDraft("");
                    }}
                    className="flex min-h-8 items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600"
                  >
                    <X className="h-3 w-3" /> Abbrechen
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{n.content}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
