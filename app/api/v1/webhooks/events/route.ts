import { NextResponse } from "next/server";
import { authorizeExternalApi } from "../../../../../lib/scale/api-auth";
import { listWebhookEvents } from "../../../../../lib/scale/api-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = authorizeExternalApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ events: listWebhookEvents() });
}
