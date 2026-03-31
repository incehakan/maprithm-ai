import { NextResponse } from "next/server";
import { validateRuntimeConfig } from "@/lib/runtimeConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = validateRuntimeConfig({ strict: false });
  return NextResponse.json({
    status: cfg.ok ? "ok" : "degraded",
    uptime: process.uptime(),
    environment: process.env.NODE_ENV ?? "unknown",
    timestamp: new Date().toISOString(),
    config: {
      ok: cfg.ok,
      missing: cfg.missing,
      warnings: cfg.warnings
    }
  });
}

