// GET /api/v1/events/stream — Server-Sent Events.
// Subscribed an LISTEN-Client, pusht NOTIFY-Events an Browser.
// Heartbeat alle 30s mit Auth-Re-Validation.

import { auth } from "@/auth";
import { subscribeChannels, type ChannelEvent } from "@/lib/sse/listen-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_INTERVAL_MS = 30_000;

function sseFormat(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: NodeJS.Timeout | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      function send(chunk: string) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      }

      // Connected-Event
      send(
        sseFormat("connected", {
          server_time: new Date().toISOString(),
          heartbeat_interval_s: HEARTBEAT_INTERVAL_MS / 1000,
        }),
      );

      // NOTIFY → SSE
      const onEvent = (e: ChannelEvent) => send(sseFormat(e.channel, e.payload));
      try {
        unsubscribe = await subscribeChannels(onEvent);
      } catch (err) {
        console.error("[SSE] subscribe failed:", err);
        send(sseFormat("error", { message: "Realtime kurz nicht verfügbar" }));
      }

      // Heartbeat + Auth-Validation
      heartbeat = setInterval(async () => {
        if (closed) return;
        const s = await auth().catch(() => null);
        if (!s?.user?.id) {
          send(sseFormat("session_expired", {}));
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
          return;
        }
        send(sseFormat("heartbeat", { ts: new Date().toISOString() }));
      }, HEARTBEAT_INTERVAL_MS);
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
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
