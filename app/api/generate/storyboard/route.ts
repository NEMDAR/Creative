import { NextResponse } from "next/server";
import { buildStoryboard } from "../../../../lib/editor/storyboard";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { brief?: string };
    const brief = body.brief?.trim();
    if (!brief) {
      return NextResponse.json({ error: "brief is required." }, { status: 400 });
    }
    return NextResponse.json(buildStoryboard(brief));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to build storyboard." },
      { status: 400 }
    );
  }
}
