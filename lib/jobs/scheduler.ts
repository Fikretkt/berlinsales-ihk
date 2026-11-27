// node-cron Scheduler — startet alle drei Jobs für beide Datenbanken.

import cron from "node-cron";
import { ersteDb, zweiteDb } from "@/lib/db/client";
import { expireReservations } from "./expire-reservations";
import { broadcastCooldownExpiry } from "./broadcast-cooldown-expiry";
import { anonymizeOldGeo } from "./anonymize-old-geo";

let started = false;

export function startSchedulers(): void {
  if (started) return;
  started = true;

  const databases = [
    { bereich: "internal", db: ersteDb },
    { bereich: "external", db: zweiteDb },
  ];

  for (const { bereich, db } of databases) {
    // Jede Minute
    cron.schedule("* * * * *", async () => {
      try {
        const r = await expireReservations(db);

        if (r.count > 0) {
          console.log(
            `[cron][${bereich}] expire_reservations: ${r.count} markets in ${r.durationMs}ms`,
          );
        }
      } catch (err) {
        console.error(
          `[cron][${bereich}] expire_reservations failed:`,
          err,
        );
      }
    });

    // Alle 5 Minuten
    cron.schedule("*/5 * * * *", async () => {
      try {
        const r = await broadcastCooldownExpiry(db);

        if (r.count > 0) {
          console.log(
            `[cron][${bereich}] broadcast_cooldown_expiry: ${r.count} markets in ${r.durationMs}ms`,
          );
        }
      } catch (err) {
        console.error(
          `[cron][${bereich}] broadcast_cooldown_expiry failed:`,
          err,
        );
      }
    });

    // Täglich um 03:00 Berlin
    cron.schedule(
      "0 3 * * *",
      async () => {
        try {
          const r = await anonymizeOldGeo(db);

          if (r.count > 0) {
            console.log(
              `[cron][${bereich}] anonymize_old_geo: ${r.count} actions in ${r.durationMs}ms`,
            );
          }
        } catch (err) {
          console.error(
            `[cron][${bereich}] anonymize_old_geo failed:`,
            err,
          );
        }
      },
      { timezone: "Europe/Berlin" },
    );
  }

  console.log("[cron] schedulers started for internal and external databases");
}