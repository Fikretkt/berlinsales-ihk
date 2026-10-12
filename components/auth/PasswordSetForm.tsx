"use client";

// Gemeinsamer Form-Component für Setup und Reset-Confirm.
// Unterscheidet sich nur in der API-URL und dem Erfolgs-Text.

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function PasswordSetForm({
  apiPath,
  ctaLabel,
  successLabel,
  validateOnLoad,
}: {
  apiPath: string;
  ctaLabel: string;
  successLabel: string;
  validateOnLoad?: string; // Validierungs-URL für GET (nur Setup, Reset macht's nicht)
}) {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenValid, setTokenValid] = useState<boolean | null>(
    validateOnLoad ? null : true,
  );

  useEffect(() => {
    if (!validateOnLoad || !token) {
      if (!token) setTokenValid(false);
      return;
    }
    fetch(`${validateOnLoad}?token=${encodeURIComponent(token)}`)
      .then((r) => setTokenValid(r.ok))
      .catch(() => setTokenValid(false));
  }, [token, validateOnLoad]);

  if (tokenValid === false) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Dieser Link ist abgelaufen oder ungültig.
        </p>
        <p className="text-sm">
          Bitte fordere eine neue Einladung oder einen neuen Reset-Link an.
        </p>
      </div>
    );
  }
  if (tokenValid === null) {
    return <p className="text-sm text-gray-500">Link wird geprüft …</p>;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== password2) {
      setError("Die zwei Passwörter sind nicht gleich.");
      return;
    }
    if (password.length < 10) {
      setError("Das Passwort muss mindestens 10 Zeichen lang sein.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Es ist ein Fehler aufgetreten.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Verbindung fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          Neues Passwort
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full min-h-12 rounded-lg border border-gray-300 px-3 text-base focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <p className="mt-1 text-xs text-gray-500">Mindestens 10 Zeichen.</p>
      </div>
      <div>
        <label htmlFor="password2" className="block text-sm font-medium text-gray-700">
          Passwort wiederholen
        </label>
        <input
          id="password2"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          className="mt-1 block w-full min-h-12 rounded-lg border border-gray-300 px-3 text-base focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>
      {error && (
        <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="flex w-full min-h-12 items-center justify-center rounded-lg bg-green-600 px-4 text-base font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-60"
      >
        {loading ? successLabel + " …" : ctaLabel}
      </button>
    </form>
  );
}
