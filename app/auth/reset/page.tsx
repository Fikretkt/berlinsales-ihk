"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";

export default function ResetRequestPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/v1/auth/reset-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setLoading(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <AuthShell title="E-Mail gesendet">
        <p className="text-sm text-gray-700">
          Wenn die E-Mail-Adresse bei uns hinterlegt ist, haben wir dir einen Link zum
          Passwort-Zurücksetzen geschickt. Schau auch im Spam-Ordner nach.
        </p>
        <p className="mt-4 text-sm">
          <Link href="/auth/login" className="text-green-700 underline">
            Zurück zum Login
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Passwort vergessen?" subtitle="Wir senden dir einen Link per E-Mail.">
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
        <button
          type="submit"
          disabled={loading}
          className="flex w-full min-h-12 items-center justify-center rounded-lg bg-green-600 px-4 text-base font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-60"
        >
          {loading ? "Senden …" : "Link senden"}
        </button>
        <div className="text-center text-sm">
          <Link href="/auth/login" className="text-gray-600 underline">
            Zurück zum Login
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
