import { timingSafeEqual } from "node:crypto";

export type ApiAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

export function authorizeExternalApi(request: Request): ApiAuthResult {
  const configured = process.env.NEMDAR_API_KEY?.trim();
  if (!configured) {
    return {
      ok: false,
      status: 503,
      error: "External API is not configured.",
    };
  }

  const headerKey = request.headers.get("x-nemdar-api-key")?.trim();
  const authorization = request.headers.get("authorization")?.trim();
  const bearerKey = authorization?.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : undefined;
  const supplied = headerKey || bearerKey;

  if (!supplied || !safeEqual(supplied, configured)) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized.",
    };
  }

  return { ok: true };
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
