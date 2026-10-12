// Separater Worker-Process für Cron-Jobs (Production).
// Verwendung: pnpm exec tsx scripts/jobs.ts

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { startSchedulers } from "../lib/jobs/scheduler";

startSchedulers();
console.log("Job-Worker läuft. Strg+C zum Beenden.");

// Process am Leben halten
process.on("SIGINT", () => {
  console.log("SIGINT empfangen, shutting down …");
  process.exit(0);
});
process.on("SIGTERM", () => {
  console.log("SIGTERM empfangen, shutting down …");
  process.exit(0);
});
