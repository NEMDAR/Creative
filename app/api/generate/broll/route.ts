import { NextResponse } from "next/server";
import {
  addBrollSuggestions,
  type StoryboardAssetSummary,
  type StoryboardPlan,
} from "../../../../lib/editor/storyboard";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      plan?: StoryboardPlan;
      assets?: StoryboardAssetSummary[];
    };
    if (!body.plan?.scenes?.length) {
      return NextResponse.json({ error: "storyboard plan is required." }, { status: 400 });
    }
    return NextResponse.json(
      addBrollSuggestions(body.plan, Array.isArray(body.assets) ? body.assets : [])
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to suggest B-roll." },
      { status: 400 }
    );
  }
}
