import { NextResponse } from "next/server";
import { pool } from "@/lib/db/client";
import { productionConfigIssues } from "@/lib/env/production";
import { APP_VERSION } from "@/lib/release";

export const dynamic = "force-dynamic";

// Readiness is deliberately separate from liveness: it proves the app can use
// its required database without exposing connection details to callers.
export async function GET() {
  if (productionConfigIssues().length > 0) {
    return NextResponse.json({ status: "unavailable", version: APP_VERSION }, { status: 503 });
  }
  try {
    await pool.query("SELECT 1");
    return NextResponse.json({ status: "ok", version: APP_VERSION });
  } catch {
    console.error("Readiness check failed: database unavailable");
    return NextResponse.json({ status: "unavailable", version: APP_VERSION }, { status: 503 });
  }
}
