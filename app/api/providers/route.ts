import { NextResponse } from "next/server";
import type { ProviderCapability } from "../../../lib/providers/contracts";
import { getProviderRouter } from "../../../lib/providers/runtime";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getProviderRouter().snapshot());
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      capability?: ProviderCapability;
      providerId?: string;
    };

    if (
      !body.capability ||
      !["image", "video", "voice"].includes(body.capability)
    ) {
      return NextResponse.json(
        { error: "capability must be image, video or voice." },
        { status: 400 }
      );
    }

    if (!body.providerId?.trim()) {
      return NextResponse.json(
        { error: "providerId is required." },
        { status: 400 }
      );
    }

    const snapshot = getProviderRouter().select(
      body.capability,
      body.providerId
    );
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to change provider selection.",
      },
      { status: 400 }
    );
  }
}
