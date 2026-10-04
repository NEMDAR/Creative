import { NextResponse } from "next/server";
import { getProviderRouter } from "../../../../lib/providers/runtime";
import {
  finalizeGenerationCost,
  guardGeneration,
} from "../../../../lib/operations/generation-guard";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      text?: string;
      voice?: string;
      language?: string;
      routingPolicy?: "quality" | "latency" | "cost" | "balanced";
      projectId?: string;
    };

    const text = body.text?.trim();
    if (!text) {
      return NextResponse.json({ error: "text is required." }, { status: 400 });
    }

    const router = getProviderRouter();
    const routingDecision = body.routingPolicy
      ? router.route("voice", body.routingPolicy)
      : null;
    const job = router.synthesizeVoice({
      text,
      voice: body.voice,
      language: body.language,
    });

    const guard = await guardGeneration(request, {
      projectId: body.projectId,
      estimatedCostUsd: job.estimatedCost ?? 0,
      routingDecision,
      capability: "voice",
    });
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error, budget: guard.budget ?? null, routingDecision },
        { status: guard.status }
      );
    }

    const artifact = await job.run();
    await finalizeGenerationCost({
      projectId: guard.projectId,
      estimatedCostUsd: job.estimatedCost ?? 0,
      capability: "voice",
      provider: artifact.provider,
      model: artifact.model,
      routingDecision,
    });

    return NextResponse.json({
      artifact,
      text,
      voice: body.voice ?? "default",
      language: body.language ?? "auto",
      estimatedCost: job.estimatedCost ?? null,
      createdAt: Date.now(),
      routingDecision,
      budget: guard.budget,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to synthesize voice." },
      { status: 400 }
    );
  }
}
