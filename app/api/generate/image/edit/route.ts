import { NextResponse } from "next/server";
import { getProviderRouter } from "../../../../../lib/providers/runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      prompt?: string;
      imageUrl?: string;
      aspectRatio?: string;
      operation?: "edit" | "background" | "outpaint";
    };

    const prompt = body.prompt?.trim();
    if (!prompt) {
      return NextResponse.json({ error: "prompt is required." }, { status: 400 });
    }
    if (!body.imageUrl?.trim()) {
      return NextResponse.json({ error: "imageUrl is required." }, { status: 400 });
    }

    const job = getProviderRouter().editImage({
      prompt,
      imageUrl: body.imageUrl,
      aspectRatio: body.aspectRatio,
    });
    const artifact = await job.run();

    return NextResponse.json({
      artifact,
      prompt,
      operation: body.operation ?? "edit",
      requestedAspectRatio: body.aspectRatio ?? null,
      estimatedCost: job.estimatedCost ?? null,
      createdAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to edit image.",
      },
      { status: 400 }
    );
  }
}
