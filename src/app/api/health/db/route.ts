import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAndBuildApiError } from "@/lib/errorHandling";
import { getRequestId } from "@/lib/requestContext";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    const started = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const elapsedMs = Date.now() - started;
    return NextResponse.json({
      status: "ok",
      db: "reachable",
      elapsedMs,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? "unknown",
      requestId
    });
  } catch (err) {
    const payload = logAndBuildApiError({
      err,
      fallbackMessage: "DB health check failed",
      requestId,
      context: { route: "/api/health/db" }
    });
    return NextResponse.json(
      {
        ...payload,
        status: "error",
        db: "unreachable",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV ?? "unknown"
      },
      { status: 500 }
    );
  }
}

