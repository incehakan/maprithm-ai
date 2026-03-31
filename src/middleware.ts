import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Ensures every API/admin request has x-request-id for log correlation.
 * Accepts incoming x-request-id / x-correlation-id from clients or generators.
 */
export function middleware(request: NextRequest) {
  const incoming =
    request.headers.get("x-request-id")?.trim() ||
    request.headers.get("x-correlation-id")?.trim();
  const requestId = incoming || crypto.randomUUID();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("x-request-id", requestId);
  return res;
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*"]
};
