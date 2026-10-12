"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Mail, AlertCircle } from "lucide-react";
import { formatBerlinDateTime } from "@/lib/markets/status-display";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "field_user" | "admin";
  active: boolean;
  hasPassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  companyId: string;
  companyName: string;
}

async function fetchUsers(): Promise<AdminUser[]> {
  const res = await fetch("/api/v1/admin/users", { credentials: "include" });
  if (!res.ok) throw new Error("Fehler");
  return (await res.json()).data.items;
}

async function fetchCompanies(): Promise<{ id: string; name: string }[]> {
  const res = await fetch("/api/v1/admin/companies", { credentials: "include" });
  if (!res.ok) return [];
  return (await res.json()).data.items;
}

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const [invite, setInvite] = useState<null | {
    email: string;
    name: string;
    role: "field_user" | "admin";
    company_id: string;
  }>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: fetchUsers,
  });

  const { data: companies } = useQuery({
    queryKey: ["admin-companies"],
    queryFn: fetchCompanies,
  });

  async function submitInvite() {
    if (!invite) return;
    setInviteError(null);
    const res = await fetch("/api/v1/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(invite),
    });
    const j = await res.json();
    if (!res.ok) {
      setInviteError(j.error?.message ?? "Fehler beim Einladen");
      return;
    }
    setInvite(null);
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    if (!j.data.email_sent) {
      alert(
        `Benutzer angelegt, aber E-Mail konnte nicht gesendet werden: ${j.data.email_error}. Du kannst die Einladung in der Liste erneut senden.`,
      );
    }
  }

  async function toggleActive(u: AdminUser) {
    const verb = u.active ? "deaktivieren" : "reaktivieren";
    if (!confirm(`Benutzer "${u.name}" wirklich ${verb}?`)) return;
    const res = await fetch(`/api/v1/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ active: !u.active }),
    });
    if (!res.ok) {
      const j = await res.json();
      alert(j.error?.message ?? "Fehler");
      return;
    }
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  }

  async function changeRole(u: AdminUser, newRole: "field_user" | "admin") {
    const res = await fetch(`/api/v1/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ role: newRole }),
    });
    if (!res.ok) {
      const j = await res.json();
      alert(j.error?.message ?? "Fehler");
      return;
    }
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  }

  async function resendInvite(u: AdminUser) {
    const res = await fetch(`/api/v1/admin/users/${u.id}/resend-invitation`, {
      method: "POST",
      credentials: "include",
    });
    const j = await res.json();
    if (!res.ok) {
      alert(j.error?.message ?? "Fehler");
      return;
    }
    if (j.data.email_sent) {
      alert("Einladung erneut gesendet.");
    } else {
      alert(`E-Mail konnte nicht gesendet werden: ${j.data.email_error}`);
    }
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Benutzer verwalten</h1>
        <button
          onClick={() =>
            setInvite({
              email: "",
              name: "",
              role: "field_user",
              company_id: companies?.[0]?.id ?? "",
            })
          }
          className="flex min-h-10 items-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700"
        >
          <Plus className="h-4 w-4" /> Benutzer einladen
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-3 text-left">Name</th>
              <th className="px-3 py-3 text-left">E-Mail</th>
              <th className="px-3 py-3 text-left">Firma</th>
              <th className="px-3 py-3 text-left">Rolle</th>
              <th className="px-3 py-3 text-left">Status</th>
              <th className="px-3 py-3 text-left">Zuletzt eingeloggt</th>
              <th className="px-3 py-3 text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  Lädt …
                </td>
              </tr>
            )}
            {data?.map((u) => (
              <tr key={u.id} className={!u.active ? "bg-gray-50" : undefined}>
                <td className="px-3 py-2 font-medium text-gray-900">{u.name}</td>
                <td className="px-3 py-2 text-gray-600">{u.email}</td>
                <td className="px-3 py-2 text-gray-600">{u.companyName}</td>
                <td className="px-3 py-2">
                  <select
                    value={u.role}
                    onChange={(e) =>
                      changeRole(u, e.target.value as "field_user" | "admin")
                    }
                    className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
                  >
                    <option value="field_user">Field User</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  {!u.hasPassword ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      <AlertCircle className="h-3 w-3" /> Noch nicht aktiviert
                    </span>
                  ) : u.active ? (
                    <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                      aktiv
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      inaktiv
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {u.lastLoginAt ? formatBerlinDateTime(u.lastLoginAt) : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex gap-1">
                    {!u.hasPassword && (
                      <button
                        onClick={() => resendInvite(u)}
                        className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                      >
                        <Mail className="h-3 w-3" /> Einladung erneut
                      </button>
                    )}
                    <button
                      onClick={() => toggleActive(u)}
                      className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      {u.active ? "deaktivieren" : "reaktivieren"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {invite && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-semibold">Benutzer einladen</h2>
            <p className="mt-1 text-sm text-gray-500">
              Der Benutzer bekommt eine E-Mail mit einem Setup-Link (7 Tage gültig).
            </p>

            <div className="mt-4 space-y-3">
              <Field label="Name">
                <input
                  value={invite.name}
                  onChange={(e) => setInvite({ ...invite, name: e.target.value })}
                  className="form-input"
                  placeholder="Max Mustermann"
                />
              </Field>
              <Field label="E-Mail">
                <input
                  type="email"
                  value={invite.email}
                  onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                  className="form-input"
                  placeholder="max@firma.de"
                />
              </Field>
              <Field label="Firma">
                <select
                  value={invite.company_id}
                  onChange={(e) =>
                    setInvite({ ...invite, company_id: e.target.value })
                  }
                  className="form-input"
                >
                  {companies?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Rolle">
                <select
                  value={invite.role}
                  onChange={(e) =>
                    setInvite({
                      ...invite,
                      role: e.target.value as "field_user" | "admin",
                    })
                  }
                  className="form-input"
                >
                  <option value="field_user">Field User (App-Nutzer)</option>
                  <option value="admin">Admin (Verwaltung)</option>
                </select>
              </Field>
            </div>

            {inviteError && (
              <div role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {inviteError}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setInvite(null)}
                className="min-h-10 rounded-lg border border-gray-300 px-4 text-sm"
              >
                Abbrechen
              </button>
              <button
                onClick={submitInvite}
                disabled={!invite.email || !invite.name || !invite.company_id}
                className="min-h-10 rounded-lg bg-green-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                Einladen
              </button>
            </div>

            <style jsx>{`
              :global(.form-input) {
                display: block;
                width: 100%;
                min-height: 2.75rem;
                border-radius: 0.5rem;
                border: 1px solid #d1d5db;
                padding: 0 0.75rem;
                font-size: 0.875rem;
              }
            `}</style>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}
