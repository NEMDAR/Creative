import { NextResponse } from "next/server";
import { getProviderRouter } from "../../../../lib/providers/runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      text?: string;
      voice?: string;
      language?: string;
    };

    const text = body.text?.trim();
    if (!text) {
      return NextResponse.json({ error: "text is required." }, { status: 400 });
    }

    const job = getProviderRouter().synthesizeVoice({
      text,
      voice: body.voice,
      language: body.language,
    });
    const artifact = await job.run();

    return NextResponse.json({
      artifact,
      text,
      voice: body.voice ?? "default",
      language: body.language ?? "auto",
      estimatedCost: job.estimatedCost ?? null,
      createdAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to synthesize voice." },
      { status: 400 }
    );
  }
}
