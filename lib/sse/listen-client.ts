// Dedizierte pg.Client-Instanz für LISTEN (außerhalb des Pools — Spec).
// LISTEN ist blockierend, würde sonst eine Pool-Connection dauerhaft halten.
//
// Lebenszyklus laut Reference.md → SSE-Architektur:
// 1. Server-Start: Connection aufbauen, LISTEN auf market_updated + markets_bulk_updated
// 2. NOTIFY → internes Node-Event, an alle Subscriber pushen
// 3. Server-Shutdown: UNLISTEN, Connection schließen
//
// Wir nutzen ein EventEmitter-Pattern: SSE-Endpoints registrieren onPayload-Listener.

import { EventEmitter } from "node:events";
import pg from "pg";

const { Client } = pg;

export interface MarketUpdatedPayload {
  market_id: string;
  status?: string;
}

export interface MarketsBulkUpdatedPayload {
  market_ids: string[];
}

export type ChannelEvent =
  | { channel: "market_updated"; payload: MarketUpdatedPayload }
  | { channel: "markets_bulk_updated"; payload: MarketsBulkUpdatedPayload };

class ListenManager extends EventEmitter {
  private client: pg.Client | null = null;
  private connecting: Promise<void> | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;

  async ensure(): Promise<void> {
    if (this.client) return;
    if (this.connecting) return this.connecting;
    this.connecting = this._connect();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async _connect(): Promise<void> {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL not set");
    const client = new Client({ connectionString: url });

    client.on("error", (err) => {
      console.error("[LISTEN] client error:", err.message);
      this._scheduleReconnect();
    });

    client.on("end", () => {
      console.warn("[LISTEN] connection ended");
      this.client = null;
      this._scheduleReconnect();
    });

    client.on("notification", (msg) => {
      const channel = msg.channel;
      if (channel !== "market_updated" && channel !== "markets_bulk_updated") return;
      try {
        const payload = msg.payload ? JSON.parse(msg.payload) : {};
        this.emit("event", { channel, payload } as ChannelEvent);
      } catch (err) {
        console.error("[LISTEN] payload parse error:", err);
      }
    });

    await client.connect();
    await client.query("LISTEN market_updated");
    await client.query("LISTEN markets_bulk_updated");
    this.client = client;
    console.log("[LISTEN] connected, subscribed to market_updated + markets_bulk_updated");
  }

  private _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensure().catch((err) => {
        console.error("[LISTEN] reconnect failed:", err);
        this._scheduleReconnect();
      });
    }, 3_000);
  }

  async shutdown(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.client) {
      try {
        await this.client.query("UNLISTEN *");
        await this.client.end();
      } catch {
        // ignore
      }
      this.client = null;
    }
  }
}

declare global {
  var __marktsyncListenManager: ListenManager | undefined;
}

function getManager(): ListenManager {
  if (!globalThis.__marktsyncListenManager) {
    globalThis.__marktsyncListenManager = new ListenManager();
    globalThis.__marktsyncListenManager.setMaxListeners(500); // viele SSE-Clients
  }
  return globalThis.__marktsyncListenManager;
}

export async function subscribeChannels(
  onEvent: (e: ChannelEvent) => void,
): Promise<() => void> {
  const mgr = getManager();
  await mgr.ensure();
  mgr.on("event", onEvent);
  return () => mgr.off("event", onEvent);
}
