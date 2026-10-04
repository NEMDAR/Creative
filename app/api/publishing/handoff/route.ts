import { NextResponse } from "next/server";
import {
  createPublishingHandoff,
  type PublishingHandoffInput,
} from "../../../../lib/scale/publishing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PublishingHandoffInput;
    return NextResponse.json(createPublishingHandoff(body));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create publishing handoff.",
      },
      { status: 400 }
    );
  }
}
