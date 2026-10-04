import { NextRequest, NextResponse } from "next/server";

const allowedOrigins = new Set([
  "https://creative.nemdar.tech",
  "http://127.0.0.1:3200",
  "http://localhost:3200",
]);

function applyCors(response: NextResponse, origin: string | null) {
  if (origin && allowedOrigins.has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,PUT,DELETE,OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Nemdar-Role, X-Nemdar-Actor, X-API-Key"
  );
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    return applyCors(new NextResponse(null, { status: 204 }), origin);
  }
  return applyCors(NextResponse.next(), origin);
}

export const config = {
  matcher: "/api/:path*",
};
