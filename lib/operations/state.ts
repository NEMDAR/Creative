import { promises as fs } from "node:fs";
import { join } from "node:path";
import {
  authorize,
  evaluateBudget,
  type BudgetPolicy,
  type SensitiveAction,
  type WorkspaceRole,
} from "./control-plane";

type BudgetState = {
  policy: BudgetPolicy;
  workspaceSpentUsd: number;
  projectSpentUsd: Record<string, number>;
  updatedAt: number;
};

const DEFAULT_BUDGET: BudgetState = {
  policy: {
    workspaceLimitUsd: 1_000,
    projectLimitUsd: 250,
    warningPercent: 80,
    mode: "warn",
  },
  workspaceSpentUsd: 0,
  projectSpentUsd: {},
  updatedAt: 0,
};

function root() {
  return process.env.NEMDAR_OPS_DIR?.trim() || join(process.cwd(), ".nemdar-ops");
}

function budgetFile() {
  return join(root(), "budget.json");
}

function auditFile() {
  return join(root(), "audit.jsonl");
}

export async function appendOpsAudit(entry: Record<string, unknown>) {
  await fs.mkdir(root(), { recursive: true });
  await fs.appendFile(
    auditFile(),
    JSON.stringify({ id: crypto.randomUUID(), at: Date.now(), ...entry }) + "\n",
    "utf8"
  );
}

export async function readOpsAudit(limit = 100) {
  try {
    const lines = (await fs.readFile(auditFile(), "utf8"))
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    return lines.slice(-Math.max(1, Math.min(500, limit))).reverse();
  } catch {
    return [];
  }
}

export async function readBudgetState(): Promise<BudgetState> {
  try {
    const parsed = JSON.parse(await fs.readFile(budgetFile(), "utf8")) as Partial<BudgetState>;
    return {
      policy: {
        ...DEFAULT_BUDGET.policy,
        ...(parsed.policy ?? {}),
      },
      workspaceSpentUsd: Number(parsed.workspaceSpentUsd ?? 0) || 0,
      projectSpentUsd:
        parsed.projectSpentUsd && typeof parsed.projectSpentUsd === "object"
          ? parsed.projectSpentUsd
          : {},
      updatedAt: Number(parsed.updatedAt ?? 0) || 0,
    };
  } catch {
    return { ...DEFAULT_BUDGET, projectSpentUsd: {} };
  }
}

export async function setBudgetPolicy(policy: BudgetPolicy) {
  const current = await readBudgetState();
  const next: BudgetState = {
    ...current,
    policy: normalizeBudgetPolicy(policy),
    updatedAt: Date.now(),
  };
  await writeBudgetState(next);
  return next;
}

export async function resetBudgetUsage() {
  const current = await readBudgetState();
  const next: BudgetState = {
    ...current,
    workspaceSpentUsd: 0,
    projectSpentUsd: {},
    updatedAt: Date.now(),
  };
  await writeBudgetState(next);
  return next;
}

export async function evaluateGenerationBudget(projectId: string, estimatedNextUsd: number) {
  const state = await readBudgetState();
  const result = evaluateBudget(state.policy, {
    workspaceSpentUsd: state.workspaceSpentUsd,
    projectSpentUsd: state.projectSpentUsd[projectId] ?? 0,
    estimatedNextUsd: Math.max(0, estimatedNextUsd),
  });
  await appendOpsAudit({
    action: "generation_budget_check",
    projectId,
    estimatedNextUsd,
    result,
  });
  return { state, result };
}

export async function recordGenerationSpend(
  projectId: string,
  estimatedCostUsd: number,
  metadata: Record<string, unknown> = {}
) {
  const cost = Math.max(0, estimatedCostUsd);
  const state = await readBudgetState();
  const next: BudgetState = {
    ...state,
    workspaceSpentUsd: round4(state.workspaceSpentUsd + cost),
    projectSpentUsd: {
      ...state.projectSpentUsd,
      [projectId]: round4((state.projectSpentUsd[projectId] ?? 0) + cost),
    },
    updatedAt: Date.now(),
  };
  await writeBudgetState(next);
  await appendOpsAudit({
    action: "generation_cost_recorded",
    projectId,
    costUsd: cost,
    ...metadata,
  });
  return next;
}

export async function authorizeSensitiveRequest(
  request: Request,
  action: SensitiveAction
) {
  const rawRole = request.headers.get("x-nemdar-role")?.trim();
  const role: WorkspaceRole =
    rawRole === "viewer" ||
    rawRole === "creator" ||
    rawRole === "reviewer" ||
    rawRole === "admin"
      ? rawRole
      : "admin";
  const actor = request.headers.get("x-nemdar-actor")?.trim() || "internal-ui";
  const result = authorize(role, action);
  await appendOpsAudit({
    action: "authorization",
    actor,
    role,
    permission: action,
    allowed: result.allowed,
  });
  return { ...result, actor };
}

function normalizeBudgetPolicy(policy: BudgetPolicy): BudgetPolicy {
  return {
    workspaceLimitUsd: Math.max(0, Number(policy.workspaceLimitUsd) || 0),
    projectLimitUsd: Math.max(0, Number(policy.projectLimitUsd) || 0),
    warningPercent: Math.max(1, Math.min(100, Number(policy.warningPercent) || 80)),
    mode: policy.mode === "block" ? "block" : "warn",
  };
}

async function writeBudgetState(state: BudgetState) {
  await fs.mkdir(root(), { recursive: true });
  const temp = budgetFile() + ".tmp";
  await fs.writeFile(temp, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(temp, budgetFile());
}

function round4(value: number) {
  return Number(value.toFixed(4));
}
