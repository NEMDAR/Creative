"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Mode = "operations" | "analytics";
type BudgetPolicy = {
  workspaceLimitUsd: number;
  projectLimitUsd: number;
  warningPercent: number;
  mode: "warn" | "block";
};
type BudgetState = {
  policy: BudgetPolicy;
  workspaceSpentUsd: number;
  projectSpentUsd: Record<string, number>;
  updatedAt: number;
};
type OpsSnapshot = {
  metrics: Array<{
    variantId: string;
    impressions: number;
    clicks: number;
    leads: number;
    spendUsd: number;
    conversions: number;
    ctr: number;
    cpl: number | null;
    conversionRate: number;
  }>;
  learning: {
    observed: number;
    winnerVariantId: string | null;
    insights: string[];
    autoApplied: boolean;
  };
  audit: Array<Record<string, unknown>>;
  budget: BudgetState;
};
type ProviderSnapshot = {
  providers: Array<{
    id: string;
    label: string;
    configured: boolean;
    capabilities: string[];
    models: Record<string, string[]>;
    routing?: {
      quality: number;
      latencyMs: number;
      estimatedCostUsd: Record<string, number>;
    };
  }>;
  selections: Record<string, string>;
};
type RenderSnapshot = {
  queue: {
    maxConcurrency: number;
    running: number;
    queued: number;
    failed: number;
    succeeded: number;
    runningJobIds: string[];
  };
  jobs: Array<{
    jobId: string;
    status: string;
    progress: number;
    stage: string;
    priority: string;
    attempts: number;
    maxAttempts: number;
    workerId: string | null;
    createdAt: number;
    updatedAt: number;
    completedAt: number | null;
    error: string | null;
  }>;
};
type PublishingSnapshot = {
  connectors: Array<{
    id: string;
    label: string;
    channel: string;
    status: string;
    workspaceScope: string;
    capabilities: string[];
  }>;
};
type RoutingPolicy = "quality" | "latency" | "cost" | "balanced";
type RoutingDecision = {
  provider: string;
  model: string;
  policy: RoutingPolicy;
  reason: string;
  score: number;
};

const roleMatrix = [
  ["viewer", "View workspace", "—", "—", "—"],
  ["creator", "View workspace", "Generate", "—", "—"],
  ["reviewer", "View workspace", "Generate", "Approve", "—"],
  ["admin", "Full access", "Generate", "Approve", "Manage"],
];

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}
function pct(value: number) {
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(value);
}
function when(value: unknown) {
  if (typeof value !== "number" || !value) return "—";
  return new Date(value).toLocaleString();
}

export default function OperationsConsole({ mode }: { mode: Mode }) {
  const [ops, setOps] = useState<OpsSnapshot | null>(null);
  const [providers, setProviders] = useState<ProviderSnapshot | null>(null);
  const [render, setRender] = useState<RenderSnapshot | null>(null);
  const [publishing, setPublishing] = useState<PublishingSnapshot | null>(null);
  const [budget, setBudget] = useState<BudgetPolicy>({
    workspaceLimitUsd: 1000,
    projectLimitUsd: 250,
    warningPercent: 80,
    mode: "warn",
  });
  const [routingPolicy, setRoutingPolicy] = useState<RoutingPolicy>("balanced");
  const [routingDecision, setRoutingDecision] = useState<RoutingDecision | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [opsRes, providersRes, renderRes, publishRes] = await Promise.all([
        fetch("/api/ops/control", { cache: "no-store" }),
        fetch("/api/providers", { cache: "no-store" }),
        fetch("/api/render/jobs", { cache: "no-store" }),
        fetch("/api/publishing/connectors", { cache: "no-store" }),
      ]);
      if (![opsRes, providersRes, renderRes, publishRes].every((response) => response.ok)) {
        throw new Error("One or more operational services are unavailable.");
      }
      const [nextOps, nextProviders, nextRender, nextPublishing] = await Promise.all([
        opsRes.json() as Promise<OpsSnapshot>,
        providersRes.json() as Promise<ProviderSnapshot>,
        renderRes.json() as Promise<RenderSnapshot>,
        publishRes.json() as Promise<PublishingSnapshot>,
      ]);
      setOps(nextOps);
      setProviders(nextProviders);
      setRender(nextRender);
      setPublishing(nextPublishing);
      setBudget(nextOps.budget.policy);
      setState("ready");
      setMessage(null);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to load operations.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const budgetUsed = ops?.budget.workspaceSpentUsd ?? 0;
  const budgetPercent = budget.workspaceLimitUsd > 0 ? Math.min(1, budgetUsed / budget.workspaceLimitUsd) : 0;
  const providerProfiles = useMemo(
    () =>
      (providers?.providers ?? []).map((provider) => ({
        id: provider.id,
        model: provider.models.image?.[0] ?? provider.models.video?.[0] ?? provider.models.voice?.[0] ?? "unknown",
        quality: provider.routing?.quality ?? 0,
        latencyMs: provider.routing?.latencyMs ?? 0,
        costUsd: provider.routing?.estimatedCostUsd.image ?? 0,
        configured: provider.configured,
      })),
    [providers]
  );

  async function saveBudget() {
    setMessage("Saving budget policy…");
    const response = await fetch("/api/ops/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_budget", role: "admin", actor: "p8-operations-ui", policy: budget }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload?.error ?? payload?.reason ?? "Unable to save budget policy.");
      return;
    }
    setMessage("Budget policy saved.");
    await load();
  }

  async function routeProvider() {
    setMessage("Evaluating provider route…");
    const response = await fetch("/api/ops/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "route",
        actor: "p8-operations-ui",
        policy: routingPolicy,
        profiles: providerProfiles,
      }),
    });
    const payload = (await response.json()) as RoutingDecision & { error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "Unable to route provider.");
      return;
    }
    setRoutingDecision(payload);
    setMessage("Provider route evaluated.");
  }

  return (
    <main className="businessPage" data-testid={mode === "analytics" ? "analytics-console" : "operations-console"}>
      <header className="businessTopbar">
        <div className="businessBrand">
          <span className="brandGlyph">N</span>
          <span><small>NEMDAR</small><strong>Creative Studio</strong></span>
        </div>
        <nav className="businessNav" aria-label="Product navigation">
          <a href="/editor">Editor</a>
          <a href="/campaign">Campaign</a>
          <a href="/batch">Batch</a>
          <a href="/publishing">Publishing</a>
          <a className={mode === "analytics" ? "active" : ""} href="/analytics">Analytics</a>
          <a className={mode === "operations" ? "active" : ""} href="/operations">Operations</a>
        </nav>
        <button className="businessRefresh" onClick={() => void load()} disabled={state === "loading"}>
          {state === "loading" ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      <section className="businessHero">
        <div>
          <span className="eyebrow">{mode === "analytics" ? "PERFORMANCE" : "OPERATIONS"}</span>
          <h1>{mode === "analytics" ? "Creative performance & learning" : "Production operations"}</h1>
          <p>
            {mode === "analytics"
              ? "Observed campaign performance, variant learning, spend and provider trade-offs."
              : "Render workers, provider routing, budgets, permissions, publishing health and audit activity."}
          </p>
        </div>
        <div className="businessStatus">
          <span className={state === "ready" ? "statusDot ready" : "statusDot"} />
          {state === "ready" ? "Live local services" : state === "error" ? "Service error" : "Loading services"}
        </div>
      </section>

      {message && <div className="businessNotice" role="status">{message}</div>}

      <section className="metricGrid">
        <article><span>Render running</span><strong>{render?.queue.running ?? 0}</strong><small>{render?.queue.queued ?? 0} queued</small></article>
        <article><span>Workspace spend</span><strong>{money(budgetUsed)}</strong><small>{pct(budgetPercent)} of budget</small></article>
        <article><span>Configured providers</span><strong>{providers?.providers.filter((item) => item.configured).length ?? 0}</strong><small>{Object.keys(providers?.selections ?? {}).length} routed capabilities</small></article>
        <article><span>Publishing connectors</span><strong>{publishing?.connectors.length ?? 0}</strong><small>sandbox/local scope</small></article>
      </section>

      {mode === "analytics" ? (
        <>
          <section className="businessCard" data-testid="analytics-learning">
            <div className="businessCardHeader">
              <div><span className="eyebrow">A/B LEARNING</span><h2>Observed winner</h2></div>
              <span className="subtleChip">{ops?.learning.observed ?? 0} variants observed</span>
            </div>
            <strong className="winnerValue">{ops?.learning.winnerVariantId ?? "No winner yet"}</strong>
            <div className="insightList">
              {(ops?.learning.insights ?? ["No performance rows imported yet."]).map((insight) => <p key={insight}>{insight}</p>)}
            </div>
          </section>

          <section className="businessCard">
            <div className="businessCardHeader">
              <div><span className="eyebrow">CAMPAIGN METRICS</span><h2>Variant comparison</h2></div>
              <span className="subtleChip">Sample only when imported</span>
            </div>
            <div className="businessTableWrap">
              <table className="businessTable">
                <thead><tr><th>Variant</th><th>Impressions</th><th>CTR</th><th>Leads</th><th>CPL</th><th>Conversion</th><th>Spend</th></tr></thead>
                <tbody>
                  {(ops?.metrics ?? []).length === 0 ? (
                    <tr><td colSpan={7} className="emptyCell">No analytics rows imported yet.</td></tr>
                  ) : ops?.metrics.map((row) => (
                    <tr key={row.variantId}>
                      <td><strong>{row.variantId}</strong></td><td>{row.impressions.toLocaleString()}</td><td>{pct(row.ctr)}</td>
                      <td>{row.leads}</td><td>{row.cpl === null ? "—" : money(row.cpl)}</td><td>{pct(row.conversionRate)}</td><td>{money(row.spendUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="businessCard">
            <div className="businessCardHeader"><div><span className="eyebrow">PROVIDER ECONOMICS</span><h2>Quality / latency / cost</h2></div></div>
            <div className="providerCompareGrid">
              {(providers?.providers ?? []).map((provider) => (
                <article key={provider.id}>
                  <div><strong>{provider.label}</strong><span>{provider.configured ? "Configured" : "Unavailable"}</span></div>
                  <dl>
                    <div><dt>Quality</dt><dd>{provider.routing?.quality ?? "—"}</dd></div>
                    <div><dt>Latency</dt><dd>{provider.routing?.latencyMs ?? "—"} ms</dd></div>
                    <div><dt>Image cost</dt><dd>{money(provider.routing?.estimatedCostUsd.image ?? 0)}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="businessTwoCol">
            <article className="businessCard" data-testid="render-queue-card">
              <div className="businessCardHeader">
                <div><span className="eyebrow">RENDER QUEUE</span><h2>Workers & jobs</h2></div>
                <span className="subtleChip">{render?.queue.maxConcurrency ?? 0} max workers</span>
              </div>
              <div className="queueStats">
                <span><b>{render?.queue.running ?? 0}</b> running</span>
                <span><b>{render?.queue.queued ?? 0}</b> queued</span>
                <span><b>{render?.queue.succeeded ?? 0}</b> succeeded</span>
                <span><b>{render?.queue.failed ?? 0}</b> failed</span>
              </div>
              <div className="businessTableWrap">
                <table className="businessTable">
                  <thead><tr><th>Job</th><th>Status</th><th>Priority</th><th>Attempts</th><th>Worker</th></tr></thead>
                  <tbody>
                    {(render?.jobs ?? []).length === 0 ? <tr><td colSpan={5} className="emptyCell">No render jobs yet.</td></tr> :
                      render?.jobs.slice(0, 8).map((job) => (
                        <tr key={job.jobId}><td><code>{job.jobId.slice(0, 8)}</code></td><td>{job.status} {job.progress}%</td><td>{job.priority}</td><td>{job.attempts}/{job.maxAttempts}</td><td>{job.workerId ?? "—"}</td></tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="businessCard" data-testid="provider-routing-card">
              <div className="businessCardHeader"><div><span className="eyebrow">PROVIDER ROUTING</span><h2>Policy decision</h2></div></div>
              <label className="businessField">Routing policy
                <select value={routingPolicy} onChange={(event) => setRoutingPolicy(event.target.value as RoutingPolicy)}>
                  <option value="balanced">Balanced</option><option value="quality">Quality</option><option value="latency">Latency</option><option value="cost">Cost</option>
                </select>
              </label>
              <button className="businessPrimary" onClick={() => void routeProvider()} disabled={!providerProfiles.length}>Evaluate route</button>
              {routingDecision ? (
                <div className="decisionBox">
                  <strong>{routingDecision.provider} / {routingDecision.model}</strong>
                  <span>Score {routingDecision.score}</span>
                  <p>{routingDecision.reason}</p>
                </div>
              ) : <p className="emptyHint">Run a policy decision to inspect provider routing provenance.</p>}
            </article>
          </section>

          <section className="businessTwoCol">
            <article className="businessCard" data-testid="budget-card">
              <div className="businessCardHeader"><div><span className="eyebrow">COST CONTROL</span><h2>Workspace budget</h2></div></div>
              <div className="budgetBar"><span style={{ width: `${budgetPercent * 100}%` }} /></div>
              <div className="formGrid">
                <label className="businessField">Workspace limit
                  <input type="number" min={0} step={10} value={budget.workspaceLimitUsd} onChange={(e) => setBudget((current) => ({ ...current, workspaceLimitUsd: Number(e.target.value) }))} />
                </label>
                <label className="businessField">Project limit
                  <input type="number" min={0} step={10} value={budget.projectLimitUsd} onChange={(e) => setBudget((current) => ({ ...current, projectLimitUsd: Number(e.target.value) }))} />
                </label>
                <label className="businessField">Warning %
                  <input type="number" min={1} max={100} value={budget.warningPercent} onChange={(e) => setBudget((current) => ({ ...current, warningPercent: Number(e.target.value) }))} />
                </label>
                <label className="businessField">Mode
                  <select value={budget.mode} onChange={(e) => setBudget((current) => ({ ...current, mode: e.target.value as "warn" | "block" }))}><option value="warn">Warn</option><option value="block">Block</option></select>
                </label>
              </div>
              <button className="businessPrimary" onClick={() => void saveBudget()}>Save budget policy</button>
            </article>

            <article className="businessCard" data-testid="publishing-health-card">
              <div className="businessCardHeader"><div><span className="eyebrow">PUBLISHING</span><h2>Connector health</h2></div></div>
              <div className="connectorList">
                {(publishing?.connectors ?? []).map((connector) => (
                  <div key={connector.id}><span className="connectorIcon">{connector.channel.slice(0, 2).toUpperCase()}</span><span><strong>{connector.label}</strong><small>{connector.workspaceScope}</small></span><em>{connector.status}</em></div>
                ))}
              </div>
            </article>
          </section>

          <section className="businessCard" data-testid="roles-card">
            <div className="businessCardHeader"><div><span className="eyebrow">ACCESS</span><h2>Roles & permissions</h2></div><span className="subtleChip">Control-plane policy</span></div>
            <div className="businessTableWrap">
              <table className="businessTable">
                <thead><tr><th>Role</th><th>Workspace</th><th>Generate</th><th>Approve</th><th>Admin</th></tr></thead>
                <tbody>{roleMatrix.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={index}>{index === 0 ? <strong>{cell}</strong> : cell}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className="businessCard" data-testid="audit-card">
            <div className="businessCardHeader"><div><span className="eyebrow">AUDIT</span><h2>Recent control-plane activity</h2></div><span className="subtleChip">{ops?.audit.length ?? 0} loaded</span></div>
            <div className="businessTableWrap">
              <table className="businessTable">
                <thead><tr><th>Time</th><th>Action</th><th>Actor</th><th>Detail</th></tr></thead>
                <tbody>
                  {(ops?.audit ?? []).length === 0 ? <tr><td colSpan={4} className="emptyCell">No audit entries yet.</td></tr> :
                    ops?.audit.slice(0, 20).map((entry, index) => (
                      <tr key={String(entry["id"] ?? index)}><td>{when(entry["at"])}</td><td>{String(entry["action"] ?? "—")}</td><td>{String(entry["actor"] ?? "—")}</td><td><code>{JSON.stringify(entry).slice(0, 120)}</code></td></tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
