export type RoutingPolicy = "quality" | "latency" | "cost" | "balanced";
export type ProviderProfile = {
  id: string; model: string; quality: number; latencyMs: number; costUsd: number; configured: boolean;
};
export type RoutingDecision = {
  provider: string; model: string; policy: RoutingPolicy; reason: string; score: number;
};

export function routeProvider(profiles: ProviderProfile[], policy: RoutingPolicy): RoutingDecision {
  const eligible = profiles.filter((item) => item.configured);
  if (!eligible.length) throw new Error("No configured provider is eligible.");
  const maxLatency = Math.max(...eligible.map((item) => item.latencyMs), 1);
  const maxCost = Math.max(...eligible.map((item) => item.costUsd), 0.0001);
  const scored = eligible.map((item) => {
    const quality = clamp01(item.quality / 100);
    const latency = 1 - clamp01(item.latencyMs / maxLatency);
    const cost = 1 - clamp01(item.costUsd / maxCost);
    const score = policy === "quality" ? quality :
      policy === "latency" ? latency :
      policy === "cost" ? cost :
      quality * 0.5 + latency * 0.25 + cost * 0.25;
    return { item, score };
  }).sort((a,b)=>b.score-a.score || a.item.id.localeCompare(b.item.id));
  const winner = scored[0];
  return {
    provider:winner.item.id, model:winner.item.model, policy,
    score:Number(winner.score.toFixed(4)),
    reason:`${policy} policy selected ${winner.item.id}/${winner.item.model} from ${eligible.length} configured providers using declared quality, latency and cost signals.`,
  };
}

export type BudgetPolicy = {
  workspaceLimitUsd: number; projectLimitUsd: number; warningPercent: number; mode: "warn" | "block";
};
export type BudgetUsage = { workspaceSpentUsd: number; projectSpentUsd: number; estimatedNextUsd: number };
export function evaluateBudget(policy: BudgetPolicy, usage: BudgetUsage) {
  const workspaceAfter = usage.workspaceSpentUsd + usage.estimatedNextUsd;
  const projectAfter = usage.projectSpentUsd + usage.estimatedNextUsd;
  const workspacePct = policy.workspaceLimitUsd > 0 ? workspaceAfter / policy.workspaceLimitUsd : 1;
  const projectPct = policy.projectLimitUsd > 0 ? projectAfter / policy.projectLimitUsd : 1;
  const over = workspaceAfter > policy.workspaceLimitUsd || projectAfter > policy.projectLimitUsd;
  const warning = over || Math.max(workspacePct, projectPct) >= policy.warningPercent / 100;
  return {
    allowed: !(over && policy.mode === "block"), warning, over,
    workspaceAfter:Number(workspaceAfter.toFixed(4)), projectAfter:Number(projectAfter.toFixed(4)),
    reason: over ? `Estimated generation exceeds ${workspaceAfter > policy.workspaceLimitUsd ? "workspace" : "project"} budget.` :
      warning ? "Estimated generation is near the configured budget threshold." : "Within configured budget.",
  };
}

export type CreativeMetric = {
  variantId:string; impressions:number; clicks:number; leads:number; spendUsd:number; conversions:number;
};
export function normalizeMetrics(rows: CreativeMetric[]) {
  return rows.map((row)=>({
    ...row,
    ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
    cpl: row.leads > 0 ? row.spendUsd / row.leads : null,
    conversionRate: row.clicks > 0 ? row.conversions / row.clicks : 0,
  }));
}
export function summarizeLearning(rows: CreativeMetric[]) {
  const metrics = normalizeMetrics(rows);
  const ranked = [...metrics].sort((a,b)=>
    b.conversionRate-a.conversionRate || b.ctr-a.ctr || (a.cpl ?? Infinity)-(b.cpl ?? Infinity)
  );
  const winner = ranked[0] ?? null;
  return {
    observed: metrics.length,
    winnerVariantId: winner?.variantId ?? null,
    insights: winner ? [
      `${winner.variantId} currently leads on observed conversion rate (${(winner.conversionRate*100).toFixed(2)}%).`,
      "Treat this as observed performance, not a guaranteed future outcome.",
      "No brand, claim, or creative content was changed automatically.",
    ] : ["No performance rows imported yet."],
    autoApplied:false,
  };
}

export type WorkspaceRole = "viewer" | "creator" | "reviewer" | "admin";
export type SensitiveAction = "generate" | "publish" | "approve" | "manage_budget" | "manage_roles";
const PERMISSIONS: Record<WorkspaceRole, SensitiveAction[]> = {
  viewer:[], creator:["generate"], reviewer:["generate","approve"], admin:["generate","publish","approve","manage_budget","manage_roles"],
};
export function authorize(role: WorkspaceRole, action: SensitiveAction) {
  const allowed = PERMISSIONS[role].includes(action);
  return { allowed, role, action, reason: allowed ? `${role} may ${action}.` : `${role} may not ${action}.` };
}

function clamp01(value:number){ return Math.max(0,Math.min(1,value)); }
