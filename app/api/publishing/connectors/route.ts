import { NextResponse } from "next/server";
import { PUBLISHING_CONNECTORS } from "../../../../lib/scale/publishing";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    connectors: PUBLISHING_CONNECTORS,
    generatedAt: Date.now(),
  });
}
