"use client";

// SSE-Client: connects zu /api/v1/events/stream, invalidiert TanStack-Query-Cache
// für Markt-Daten. Wird im Field-Layout gemountet, sodass alle Field-Pages live updaten.

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

export function SseListener() {
  const qc = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    const es = new EventSource("/api/v1/events/stream");

    es.addEventListener("connected", () => {
      // ok
    });

    es.addEventListener("market_updated", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        qc.invalidateQueries({ queryKey: ["markets"] });
        qc.invalidateQueries({ queryKey: ["admin-markets"] });
        qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
        if (data.market_id && window.location.pathname.includes(data.market_id)) {
          router.refresh();
        }
      } catch {
        // ignore
      }
    });

    es.addEventListener("markets_bulk_updated", () => {
      qc.invalidateQueries({ queryKey: ["markets"] });
      qc.invalidateQueries({ queryKey: ["admin-markets"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    });

    es.addEventListener("session_expired", () => {
      es.close();
      router.push("/auth/login");
    });

    es.onerror = () => {
      // Browser macht Auto-Reconnect
    };

    return () => {
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
