import { NextResponse } from "next/server";
import { authorizeExternalApi } from "../../../../lib/scale/api-auth";
import {
  createWebhookSubscription,
  listWebhookSubscriptions,
  type WebhookEventType,
} from "../../../../lib/scale/api-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = authorizeExternalApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ webhooks: listWebhookSubscriptions() });
}

export async function POST(request: Request) {
  const auth = authorizeExternalApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = (await request.json()) as { url?: string; eventTypes?: WebhookEventType[] };
    return NextResponse.json(
      createWebhookSubscription({
        url: body.url ?? "",
        eventTypes: Array.isArray(body.eventTypes) ? body.eventTypes : [],
      }),
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create webhook." },
      { status: 400 }
    );
  }
}
