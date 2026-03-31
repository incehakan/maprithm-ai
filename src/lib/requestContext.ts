import { randomUUID } from "crypto";

export function getRequestId(request: Request): string {
  return (
    request.headers.get("x-request-id")?.trim() ||
    request.headers.get("x-correlation-id")?.trim() ||
    randomUUID()
  );
}

