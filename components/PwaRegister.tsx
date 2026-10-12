"use client";

// Registriert den Service Worker einmal pro Seite-Load.
// Nur in Production aktiv (in Dev würde HMR-Updates kollidieren).

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.warn("SW registration failed:", err));
  }, []);
  return null;
}
