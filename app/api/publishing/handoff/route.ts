import { NextResponse } from "next/server";
import {
  createPublishingHandoff,
  type PublishingHandoffInput,
} from "../../../../lib/scale/publishing";
import { authorizeSensitiveRequest } from "../../../../lib/operations/state";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const permission = await authorizeSensitiveRequest(request, "publish");
    if (!permission.allowed) {
      return NextResponse.json(
        { error: permission.reason },
        { status: 403 }
      );
    }

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
