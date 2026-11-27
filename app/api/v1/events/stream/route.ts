import { NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { hostBereich, dbAuswahl } from "@/lib/db/dbAuswahl";
import { getSessionUser } from "@/lib/auth/session";
import {
  market as marketTable,
  user as userTable,
} from "@/lib/db/schema";
import {
  subscribeChannels,
  type ChannelEvent,
} from "@/lib/sse/listen-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_INTERVAL_MS = 30_000;

function sseFormat(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: NextRequest) {
  const host = req.headers.get("host");

  if (!host) {
    return new Response("Host fehlt", { status: 400 });
  }

  let bereich;

  try {
    bereich = hostBereich(host);
  } catch {
    return new Response("Unbekannter Host", { status: 400 });
  }

  const requestDb = dbAuswahl(bereich);
  const sessionUser = await getSessionUser(requestDb);

  if (!sessionUser) {
    return new Response("Unauthorized", { status: 401 });
  }
  const user = sessionUser;

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: NodeJS.Timeout | null = null;
  let closed = false;

  function cleanup() {
    closed = true;

    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }

    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      function send(chunk: string) {
        if (closed) return;

        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      }

      function close() {
        cleanup();

        try {
          controller.close();
        } catch {
          // Bereits geschlossen
        }
      }

      async function forwardEvent(e: ChannelEvent) {
        if (closed) return;

        const marketIds =
          e.channel === "market_updated"
            ? [e.payload.market_id]
            : e.payload.market_ids;

        if (marketIds.length === 0) return;

        // Nur Märkte des eigenen Unternehmens weitergeben.
        // Der Benutzer muss weiterhin aktiv sein.
        const rows = await requestDb
          .select({ id: marketTable.id })
          .from(marketTable)
          .innerJoin(
            userTable,
            eq(userTable.companyId, marketTable.companyId),
          )
          .where(
            and(
              eq(marketTable.companyId, user.companyId),
              eq(userTable.id, user.id),
              eq(userTable.active, true),
              inArray(marketTable.id, marketIds),
            ),
          );

        if (closed || rows.length === 0) return;

        if (e.channel === "market_updated") {
          send(sseFormat(e.channel, e.payload));
        } else {
          send(
            sseFormat(e.channel, {
              market_ids: rows.map((row) => row.id),
            }),
          );
        }
      }

      const onEvent = (e: ChannelEvent) => {
        forwardEvent(e).catch((err) => {
          console.error("[SSE] event validation failed:", err);
        });
      };

      try {
        const stop = await subscribeChannels(bereich, onEvent);

        if (closed) {
          stop();
          return;
        }

        unsubscribe = stop;
      } catch (err) {
        console.error("[SSE] subscribe failed:", err);

        send(
          sseFormat("error", {
            message: "Realtime kurz nicht verfügbar",
          }),
        );

        close();
        return;
      }

      send(
        sseFormat("connected", {
          server_time: new Date().toISOString(),
          heartbeat_interval_s: HEARTBEAT_INTERVAL_MS / 1000,
        }),
      );

      if (closed) return;

      heartbeat = setInterval(async () => {
        if (closed) return;

        const currentUser = await getSessionUser(requestDb)
          .catch(() => null);

        if (closed) return;

        if (
          !currentUser ||
          currentUser.id !== user.id ||
          currentUser.companyId !== user.companyId
        ) {
          send(sseFormat("session_expired", {}));
          close();
          return;
        }

        send(sseFormat("heartbeat", {
          ts: new Date().toISOString(),
        }));
      }, HEARTBEAT_INTERVAL_MS);
    },

    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}