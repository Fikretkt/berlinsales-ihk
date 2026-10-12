"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Keep diagnostics server-side; no error message or stack is rendered.
    void error;
    console.error("Application route error");
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
        <h1 className="text-lg font-semibold text-slate-950">Etwas ist schiefgelaufen</h1>
        <p className="mt-2 text-sm text-slate-600">Bitte versuchen Sie es erneut. Besteht das Problem weiter, informieren Sie die Administration.</p>
        <button onClick={reset} className="mt-5 min-h-11 rounded-lg bg-blue-800 px-4 text-sm font-semibold text-white hover:bg-blue-900">Erneut versuchen</button>
      </div>
    </main>
  );
}
