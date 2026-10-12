"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Login fehlgeschlagen");
        return;
      }
      router.push("/today");
      router.refresh();
    } catch {
      setError("Verbindung fehlgeschlagen. Bitte später erneut versuchen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Anmelden" subtitle="Mit deiner E-Mail und Passwort">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            E-Mail
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full min-h-12 rounded-lg border border-gray-300 px-3 text-base focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Passwort
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          {loading ? "Anmelden …" : "Anmelden"}
        </button>

        <div className="text-center text-sm">
          <Link href="/auth/reset" className="text-green-700 underline">
            Passwort vergessen?
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
