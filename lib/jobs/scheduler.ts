// node-cron Scheduler — startet alle drei Jobs.
// Wird in Production über scripts/jobs.ts gestartet, in Dev über ENABLE_CRON=true.

import cron from "node-cron";
import { expireReservations } from "./expire-reservations";
import { broadcastCooldownExpiry } from "./broadcast-cooldown-expiry";
import { anonymizeOldGeo } from "./anonymize-old-geo";

let started = false;

export function startSchedulers(): void {
  if (started) return;
  started = true;

  // Jede Minute
  cron.schedule("* * * * *", async () => {
    try {
      const r = await expireReservations();
      if (r.count > 0) {
        console.log(`[cron] expire_reservations: ${r.count} markts in ${r.durationMs}ms`);
      }
    } catch (err) {
      console.error("[cron] expire_reservations failed:", err);
    }
  });

  // Alle 5 Minuten
  cron.schedule("*/5 * * * *", async () => {
    try {
      const r = await broadcastCooldownExpiry();
      if (r.count > 0) {
        console.log(`[cron] broadcast_cooldown_expiry: ${r.count} markts in ${r.durationMs}ms`);
      }
    } catch (err) {
      console.error("[cron] broadcast_cooldown_expiry failed:", err);
    }
  });

  // Täglich um 03:00 Berlin
  cron.schedule(
    "0 3 * * *",
    async () => {
      try {
        const r = await anonymizeOldGeo();
        if (r.count > 0) {
          console.log(`[cron] anonymize_old_geo: ${r.count} actions in ${r.durationMs}ms`);
        }
      } catch (err) {
        console.error("[cron] anonymize_old_geo failed:", err);
      }
    },
    { timezone: "Europe/Berlin" },
  );

  console.log("[cron] schedulers started: expire_reservations (1min), broadcast_cooldown_expiry (5min), anonymize_old_geo (täglich 03:00)");
}
