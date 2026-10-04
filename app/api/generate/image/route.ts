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
      prompt?: string;
      aspectRatio?: string;
      routingPolicy?: "quality" | "latency" | "cost" | "balanced";
      projectId?: string;
    };

    const prompt = body.prompt?.trim();
    if (!prompt) {
      return NextResponse.json({ error: "prompt is required." }, { status: 400 });
    }

    const router = getProviderRouter();
    const routingDecision = body.routingPolicy
      ? router.route("image", body.routingPolicy)
      : null;
    const job = router.generateImage({
      prompt,
      aspectRatio: body.aspectRatio,
    });

    const guard = await guardGeneration(request, {
      projectId: body.projectId,
      estimatedCostUsd: job.estimatedCost ?? 0,
      routingDecision,
      capability: "image",
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
      capability: "image",
      provider: artifact.provider,
      model: artifact.model,
      routingDecision,
    });

    return NextResponse.json({
      artifact,
      prompt,
      estimatedCost: job.estimatedCost ?? null,
      createdAt: Date.now(),
      routingDecision,
      budget: guard.budget,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate image." },
      { status: 400 }
    );
  }
}
