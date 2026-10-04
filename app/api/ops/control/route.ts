import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import {
  authorize, evaluateBudget, normalizeMetrics, routeProvider, summarizeLearning,
  type BudgetPolicy, type BudgetUsage, type CreativeMetric, type ProviderProfile,
  type RoutingPolicy, type SensitiveAction, type WorkspaceRole,
} from "../../../../lib/operations/control-plane";
import {
  readBudgetState,
  resetBudgetUsage,
  setBudgetPolicy,
} from "../../../../lib/operations/state";

const root = () => process.env.NEMDAR_OPS_DIR?.trim() || join(process.cwd(), ".nemdar-ops");
const auditFile = () => join(root(), "audit.jsonl");
const metricsFile = () => join(root(), "metrics.json");

async function audit(entry: Record<string, unknown>) {
  await fs.mkdir(root(), { recursive:true });
  await fs.appendFile(auditFile(), JSON.stringify({ id:crypto.randomUUID(), at:Date.now(), ...entry })+"\n", "utf8");
}
async function readAudit(){
  try { return (await fs.readFile(auditFile(),"utf8")).split(/\r?\n/).filter(Boolean).map((line)=>JSON.parse(line)).slice(-100).reverse(); }
  catch { return []; }
}
async function readMetrics():Promise<CreativeMetric[]>{
  try { return JSON.parse(await fs.readFile(metricsFile(),"utf8")); } catch { return []; }
}

export async function GET(){
  const metrics=await readMetrics();
  return NextResponse.json({
    metrics:normalizeMetrics(metrics),
    learning:summarizeLearning(metrics),
    audit:await readAudit(),
    budget:await readBudgetState(),
  });
}

export async function POST(request:Request){
  const body=await request.json() as Record<string,any>;
  if(body.action==="set_budget"){
    const permission=authorize(body.role as WorkspaceRole ?? "viewer","manage_budget");
    await audit({action:"authorization",actor:body.actor??"unknown",authorization:permission});
    if(!permission.allowed) return NextResponse.json(permission,{status:403});
    const state=await setBudgetPolicy(body.policy as BudgetPolicy);
    await audit({action:"budget_policy_updated",actor:body.actor??"unknown",policy:state.policy});
    return NextResponse.json(state);
  }
  if(body.action==="reset_budget_usage"){
    const permission=authorize(body.role as WorkspaceRole ?? "viewer","manage_budget");
    await audit({action:"authorization",actor:body.actor??"unknown",authorization:permission});
    if(!permission.allowed) return NextResponse.json(permission,{status:403});
    const state=await resetBudgetUsage();
    await audit({action:"budget_usage_reset",actor:body.actor??"unknown"});
    return NextResponse.json(state);
  }
  if(body.action==="route"){
    const decision=routeProvider(body.profiles as ProviderProfile[], body.policy as RoutingPolicy);
    await audit({action:"provider_route",actor:body.actor??"system",decision});
    return NextResponse.json(decision);
  }
  if(body.action==="budget"){
    const result=evaluateBudget(body.policy as BudgetPolicy, body.usage as BudgetUsage);
    await audit({action:"budget_check",actor:body.actor??"system",result});
    return NextResponse.json(result,{status:result.allowed?200:402});
  }
  if(body.action==="import_metrics"){
    const rows=Array.isArray(body.rows)?body.rows as CreativeMetric[]:[];
    if(rows.length>1000) return NextResponse.json({error:"Metric import is limited to 1000 rows."},{status:400});
    const clean=rows.filter((row)=>row.variantId && [row.impressions,row.clicks,row.leads,row.spendUsd,row.conversions].every(Number.isFinite));
    await fs.mkdir(root(),{recursive:true});
    await fs.writeFile(metricsFile(),JSON.stringify(clean,null,2),"utf8");
    const learning=summarizeLearning(clean);
    await audit({action:"analytics_import",actor:body.actor??"system",rows:clean.length,winnerVariantId:learning.winnerVariantId});
    return NextResponse.json({rows:normalizeMetrics(clean),learning});
  }
  if(body.action==="authorize"){
    const result=authorize(body.role as WorkspaceRole,body.permission as SensitiveAction);
    await audit({action:"authorization",actor:body.actor??"unknown",authorization:result});
    return NextResponse.json(result,{status:result.allowed?200:403});
  }
  return NextResponse.json({error:"Unsupported control-plane action."},{status:400});
}
