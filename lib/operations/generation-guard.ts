import type { RoutingDecision } from "./control-plane";
import {
  appendOpsAudit,
  authorizeSensitiveRequest,
  evaluateGenerationBudget,
  recordGenerationSpend,
} from "./state";

export type GenerationGuardResult =
  | {
      ok: true;
      actor: string;
      role: string;
      projectId: string;
      budget: Awaited<ReturnType<typeof evaluateGenerationBudget>>["result"];
    }
  | {
      ok: false;
      status: 402 | 403;
      error: string;
      budget?: Awaited<ReturnType<typeof evaluateGenerationBudget>>["result"];
    };

export async function guardGeneration(
  request: Request,
  input: {
    projectId?: string;
    estimatedCostUsd: number;
    routingDecision?: RoutingDecision | null;
    capability: "image" | "video" | "voice";
  }
): Promise<GenerationGuardResult> {
  const permission = await authorizeSensitiveRequest(request, "generate");
  if (!permission.allowed) {
    return {
      ok: false,
      status: 403,
      error: permission.reason,
    };
  }

  const projectId = input.projectId?.trim() || "default";
  if (input.routingDecision) {
    await appendOpsAudit({
      action: "generation_provider_route",
      actor: permission.actor,
      projectId,
      capability: input.capability,
      decision: input.routingDecision,
    });
  }

  const budget = await evaluateGenerationBudget(
    projectId,
    input.estimatedCostUsd
  );
  if (!budget.result.allowed) {
    await appendOpsAudit({
      action: "generation_blocked_by_budget",
      actor: permission.actor,
      projectId,
      capability: input.capability,
      estimatedCostUsd: input.estimatedCostUsd,
      result: budget.result,
    });
    return {
      ok: false,
      status: 402,
      error: budget.result.reason,
      budget: budget.result,
    };
  }

  return {
    ok: true,
    actor: permission.actor,
    role: permission.role,
    projectId,
    budget: budget.result,
  };
}

export async function finalizeGenerationCost(input: {
  projectId: string;
  estimatedCostUsd: number;
  capability: "image" | "video" | "voice";
  provider: string;
  model: string;
  routingDecision?: RoutingDecision | null;
}) {
  return recordGenerationSpend(input.projectId, input.estimatedCostUsd, {
    capability: input.capability,
    provider: input.provider,
    model: input.model,
    routingPolicy: input.routingDecision?.policy ?? "manual",
    routingReason: input.routingDecision?.reason ?? "Manual provider selection.",
  });
}
