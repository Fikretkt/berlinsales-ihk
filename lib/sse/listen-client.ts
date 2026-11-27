import { EventEmitter } from "node:events";
import pg from "pg";
import { z } from "zod";
import type { DbBereich } from "@/lib/db/dbAuswahl";

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

const marketUpdatedSchema = z.object({
  market_id: z.string().uuid(),
  status: z.string().optional(),
});

const marketsBulkUpdatedSchema = z.object({
  market_ids: z.array(z.string().uuid()),
});

class ListenManager extends EventEmitter {
  private client: pg.Client | null = null;
  private connecting: Promise<void> | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(private readonly bereich: DbBereich) {
    super();
  }

  async ensure(): Promise<void> {
    if (this.stopped) throw new Error("Listener stopped");
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
    const envName =
      this.bereich === "internal"
        ? "DATABASE_URL_ERSTE"
        : "DATABASE_URL_ZWEITE";

    const url = process.env[envName];

    if (!url) throw new Error(`${envName} not set`);

    const client = new Client({ connectionString: url });

    const disconnect = () => {
      if (this.client !== client) return;

      this.client = null;
      client.end().catch(() => {});
      this._scheduleReconnect();
    };

    client.on("error", (err) => {
      console.error(`[LISTEN][${this.bereich}]`, err.message);
      disconnect();
    });

    client.on("end", disconnect);

    client.on("notification", (msg) => {
      if (this.client !== client) return;

      try {
        const payload = JSON.parse(msg.payload ?? "{}");

        if (msg.channel === "market_updated") {
          const parsed = marketUpdatedSchema.safeParse(payload);

          if (parsed.success) {
            this.emit("event", {
              channel: msg.channel,
              payload: parsed.data,
            });
          }
        }

        if (msg.channel === "markets_bulk_updated") {
          const parsed = marketsBulkUpdatedSchema.safeParse(payload);

          if (parsed.success) {
            this.emit("event", {
              channel: msg.channel,
              payload: parsed.data,
            });
          }
        }
      } catch (err) {
        console.error("[LISTEN] payload parse error:", err);
      }
    });

    try {
      await client.connect();
      await client.query("LISTEN market_updated");
      await client.query("LISTEN markets_bulk_updated");

      if (this.stopped) {
        throw new Error("Listener stopped");
      }

      this.client = client;

      console.log(`[LISTEN][${this.bereich}] connected`);
    } catch (err) {
      await client.end().catch(() => {});
      throw err;
    }
  }

  private _scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      this.ensure().catch((err) => {
        console.error("[LISTEN] reconnect failed:", err);
        this._scheduleReconnect();
      });
    }, 3_000);
  }

  async shutdown(): Promise<void> {
    this.stopped = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    await this.connecting?.catch(() => {});

    const client = this.client;
    this.client = null;

    if (client) {
      await client.query("UNLISTEN *").catch(() => {});
      await client.end().catch(() => {});
    }
  }
}

declare global {
  var __marktsyncListenManagers:
    Partial<Record<DbBereich, ListenManager>> | undefined;
}

function getManager(bereich: DbBereich): ListenManager {
  const managers =
    (globalThis.__marktsyncListenManagers ??= {});

  let manager = managers[bereich];

  if (!manager) {
    manager = new ListenManager(bereich);
    manager.setMaxListeners(500);
    managers[bereich] = manager;
  }

  return manager;
}

export async function subscribeChannels(
  bereich: DbBereich,
  onEvent: (e: ChannelEvent) => void,
): Promise<() => void> {
  const mgr = getManager(bereich);

  await mgr.ensure();
  mgr.on("event", onEvent);

  return () => mgr.off("event", onEvent);
}