import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/release";

export const dynamic = "force-dynamic";

// Liveness endpoint: intentionally does not open a database connection.
export function GET() {
  return NextResponse.json({ status: "ok", version: APP_VERSION });
}
