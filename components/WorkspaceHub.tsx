"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadBrandKit, loadPhaseTwoDraft, saveBrandKit } from "../lib/editor/storage";
import { DEFAULT_BRAND_KIT, type BrandKit } from "../lib/editor/brand-kit";

type HubMode = "home" | "projects" | "assets" | "brand" | "calendar" | "settings";
type ProjectRow = {
  id: string;
  name: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
};
type HomeSnapshot = {
  projects: ProjectRow[];
  renders: { queue: { running: number; queued: number; failed: number; succeeded: number } };
  ops: { budget: { workspaceSpentUsd: number; policy: { workspaceLimitUsd: number } }; audit: unknown[] };
  publishing: { connectors: Array<{ id: string; label: string; status: string; channel: string }> };
};

const nav = [
  ["home", "Home", "/home"],
  ["projects", "Projects", "/projects"],
  ["campaign", "Campaign Studio", "/campaign"],
  ["assets", "Assets", "/assets"],
  ["brand", "Brand Kit", "/brand-kit"],
  ["publishing", "Publishing", "/publishing"],
  ["calendar", "Calendar", "/calendar"],
  ["analytics", "Analytics", "/analytics"],
  ["operations", "Operations", "/operations"],
  ["settings", "Settings", "/settings"],
] as const;

function ProductNav({ active }: { active: string }) {
  return (
    <header className="hubTopbar">
      <a className="hubBrand" href="/home"><span className="brandGlyph">N</span><span><small>NEMDAR</small><strong>Creative Studio</strong></span></a>
      <nav className="hubNav" aria-label="Main navigation">
        {nav.map(([key, label, href]) => <a key={key} className={active === key ? "active" : ""} href={href}>{label}</a>)}
      </nav>
      <a className="hubCreate" href="/editor">+ Create</a>
    </header>
  );
}

export default function WorkspaceHub({ mode }: { mode: HubMode }) {
  const [home, setHome] = useState<HomeSnapshot | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectName, setProjectName] = useState("");
  const [draft, setDraft] = useState<Awaited<ReturnType<typeof loadPhaseTwoDraft>>>(null);
  const [brand, setBrand] = useState<BrandKit>(DEFAULT_BRAND_KIT);
  const [brandState, setBrandState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [settings, setSettings] = useState({ language: "en", reducedMotion: false, compact: false });
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      if (mode === "home") {
        const [projectsRes, renderRes, opsRes, publishingRes] = await Promise.all([
          fetch("/api/workspace/projects", { cache: "no-store" }),
          fetch("/api/render/jobs", { cache: "no-store" }),
          fetch("/api/ops/control", { cache: "no-store" }),
          fetch("/api/publishing/connectors", { cache: "no-store" }),
        ]);
        const [p, r, o, pub] = await Promise.all([projectsRes.json(), renderRes.json(), opsRes.json(), publishingRes.json()]);
        setProjects(p.projects ?? []);
        setHome({ projects: p.projects ?? [], renders: r, ops: o, publishing: pub });
      }
      if (mode === "projects") {
        const response = await fetch("/api/workspace/projects", { cache: "no-store" });
        const payload = await response.json();
        setProjects(payload.projects ?? []);
      }
      if (mode === "assets" || mode === "calendar") {
        setDraft(await loadPhaseTwoDraft());
      }
      if (mode === "brand") {
        setBrand((await loadBrandKit()) ?? DEFAULT_BRAND_KIT);
      }
      if (mode === "settings") {
        const raw = localStorage.getItem("nemdar-p8-settings");
        if (raw) setSettings({ language: "en", reducedMotion: false, compact: false, ...JSON.parse(raw) });
      }
      setState("ready");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to load workspace.");
    }
  }, [mode]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (mode !== "settings") return;
    document.documentElement.dir = settings.language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = settings.language;
    document.documentElement.dataset.reducedMotion = settings.reducedMotion ? "true" : "false";
    document.documentElement.dataset.compact = settings.compact ? "true" : "false";
    localStorage.setItem("nemdar-p8-settings", JSON.stringify(settings));
  }, [mode, settings]);

  async function createProject() {
    const name = projectName.trim();
    if (!name) return;
    const response = await fetch("/api/workspace/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, metadata: { source: "workspace-ui" } }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "Unable to create project.");
      return;
    }
    setProjectName("");
    setMessage("Project created.");
    await load();
  }

  async function persistBrand() {
    setBrandState("saving");
    try {
      await saveBrandKit(brand);
      setBrandState("saved");
    } catch {
      setBrandState("error");
    }
  }

  const scheduled = useMemo(() => (draft?.publishingHandoffs ?? []).filter((item) => item.scheduledAt), [draft]);

  return (
    <main className="hubPage" data-testid={`${mode}-page`}>
      <ProductNav active={mode} />
      <section className="hubContent">
        {message && <div className="businessNotice" role="status">{message}</div>}

        {mode === "home" && (
          <>
            <section className="hubHeader"><div><span className="eyebrow">WORKSPACE</span><h1>Creative operations at a glance</h1><p>Live local workspace state. No sample performance data is shown.</p></div><div className="businessStatus"><span className={state === "ready" ? "statusDot ready" : "statusDot"} />{state === "ready" ? "Local services ready" : "Loading"}</div></section>
            <section className="metricGrid hubMetrics">
              <article><span>Projects</span><strong>{home?.projects.length ?? 0}</strong><small>workspace records</small></article>
              <article><span>Active renders</span><strong>{home?.renders.queue.running ?? 0}</strong><small>{home?.renders.queue.queued ?? 0} queued</small></article>
              <article><span>Workspace spend</span><strong>${(home?.ops.budget.workspaceSpentUsd ?? 0).toFixed(2)}</strong><small>limit ${home?.ops.budget.policy.workspaceLimitUsd ?? 0}</small></article>
              <article><span>Publishing connectors</span><strong>{home?.publishing.connectors.length ?? 0}</strong><small>local/sandbox connectors</small></article>
            </section>
            <section className="hubGrid">
              <article className="businessCard"><div className="businessCardHeader"><div><span className="eyebrow">QUICK CREATE</span><h2>Start work</h2></div></div><div className="quickActions"><a href="/editor">New creative</a><a href="/campaign">Campaign Studio</a><a href="/batch">Batch job</a></div></article>
              <article className="businessCard"><div className="businessCardHeader"><div><span className="eyebrow">RECENT PROJECTS</span><h2>Workspace projects</h2></div><a className="textLink" href="/projects">View all</a></div>{(home?.projects.length ?? 0) === 0 ? <div className="hubEmpty"><strong>No projects yet</strong><span>Create the first project from Projects or start directly in the Editor.</span></div> : home?.projects.slice(0,5).map((project) => <a className="hubRow" href="/editor" key={project.id}><span><strong>{project.name}</strong><small>{project.status}</small></span><time>{new Date(project.updatedAt).toLocaleDateString()}</time></a>)}</article>
            </section>
          </>
        )}

        {mode === "projects" && (
          <>
            <section className="hubHeader"><div><span className="eyebrow">PROJECTS</span><h1>Projects</h1><p>Workspace project records backed by the local external API store.</p></div></section>
            <section className="businessCard">
              <div className="projectCreate"><input aria-label="New project name" value={projectName} placeholder="Project name" onChange={(e) => setProjectName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void createProject(); }} /><button className="businessPrimary" onClick={() => void createProject()}>Create project</button></div>
            </section>
            <section className="projectGrid" data-testid="project-grid">
              {projects.length === 0 ? <div className="businessCard hubEmpty"><strong>No projects yet</strong><span>Create a project to start organizing production work.</span></div> : projects.map((project) => <article className="projectCard" key={project.id}><div className="projectThumb">N</div><div><span className="subtleChip">{project.status}</span><h3>{project.name}</h3><small>Updated {new Date(project.updatedAt).toLocaleString()}</small></div><a href="/editor">Open in Editor</a></article>)}
            </section>
          </>
        )}

        {mode === "assets" && (
          <>
            <section className="hubHeader"><div><span className="eyebrow">ASSETS</span><h1>Project asset library</h1><p>Assets loaded from the current local editor draft.</p></div><a className="hubCreate" href="/editor">Upload / Generate</a></section>
            <section className="assetHubGrid" data-testid="asset-hub-grid">
              {(draft?.mediaItems.length ?? 0) === 0 ? <div className="businessCard hubEmpty"><strong>No project assets yet</strong><span>Upload or generate an asset in the Editor and it will appear here after the draft is saved.</span><a href="/editor">Open Editor</a></div> : draft?.mediaItems.map((asset) => <article className="assetHubCard" key={asset.id}><div className="assetHubPreview">{asset.kind === "image" ? "IMG" : "VID"}</div><div><strong>{asset.name}</strong><span>{asset.kind} · {(asset.blob.size/1024/1024).toFixed(2)} MB</span>{asset.generation && <small>{asset.generation.provider} · {asset.generation.model}</small>}</div></article>)}
            </section>
          </>
        )}

        {mode === "brand" && (
          <>
            <section className="hubHeader"><div><span className="eyebrow">BRAND KIT</span><h1>Brand defaults</h1><p>Stored in the same IndexedDB record used by the production editor.</p></div><span className="subtleChip">{brandState}</span></section>
            <section className="brandWorkspace">
              <article className="businessCard brandForm">
                <label className="businessField">Brand name<input value={brand.name} onChange={(e) => setBrand((current) => ({...current,name:e.target.value}))}/></label>
                <div className="formGrid">
                  <label className="businessField">Primary color<input type="color" value={brand.primaryColor} onChange={(e) => setBrand((current) => ({...current,primaryColor:e.target.value}))}/></label>
                  <label className="businessField">Secondary color<input type="color" value={brand.secondaryColor} onChange={(e) => setBrand((current) => ({...current,secondaryColor:e.target.value}))}/></label>
                  <label className="businessField">Heading font<input value={brand.headingFont} onChange={(e) => setBrand((current) => ({...current,headingFont:e.target.value}))}/></label>
                  <label className="businessField">Body font<input value={brand.bodyFont} onChange={(e) => setBrand((current) => ({...current,bodyFont:e.target.value}))}/></label>
                  <label className="businessField">Safe zone %<input type="number" min={0} max={25} value={brand.safeZone} onChange={(e) => setBrand((current) => ({...current,safeZone:Number(e.target.value)}))}/></label>
                  <label className="businessField">Caption size<input type="number" min={14} max={64} value={brand.captionFontSize} onChange={(e) => setBrand((current) => ({...current,captionFontSize:Number(e.target.value)}))}/></label>
                </div>
                <button className="businessPrimary" onClick={() => void persistBrand()}>Save Brand Kit</button>
              </article>
              <article className="brandPreview" style={{background:brand.primaryColor,color:"#fff"}}><span style={{fontFamily:brand.headingFont,fontWeight:brand.headingWeight}}>NEMDAR Creative Studio</span><strong style={{fontFamily:brand.headingFont}}>Brand preview</strong><p style={{fontFamily:brand.bodyFont}}>Primary and secondary brand defaults are shared with the editor.</p><i style={{background:brand.secondaryColor}} /></article>
            </section>
          </>
        )}

        {mode === "calendar" && (
          <>
            <section className="hubHeader"><div><span className="eyebrow">CALENDAR</span><h1>Publishing calendar</h1><p>Scheduled handoffs saved in the current local project draft.</p></div><a className="hubCreate" href="/publishing">Create handoff</a></section>
            <section className="businessCard" data-testid="calendar-list">
              {scheduled.length === 0 ? <div className="hubEmpty"><strong>No scheduled handoffs</strong><span>Approved publishing handoffs with a schedule will appear here.</span></div> : scheduled.map((item) => <div className="calendarRow" key={item.id}><time>{new Date(item.scheduledAt!).toLocaleString()}</time><span><strong>{item.projectName}</strong><small>{item.channel} · {item.accountId}</small></span><em>{item.status}</em></div>)}
            </section>
          </>
        )}

        {mode === "settings" && (
          <>
            <section className="hubHeader"><div><span className="eyebrow">SETTINGS</span><h1>Workspace preferences</h1><p>Browser-local product experience preferences.</p></div></section>
            <section className="businessCard settingsCard" data-testid="settings-card">
              <label className="businessField">Language / direction<select aria-label="Language direction" value={settings.language} onChange={(e)=>setSettings((current)=>({...current,language:e.target.value}))}><option value="en">English · LTR</option><option value="ar">العربية · RTL</option></select></label>
              <label className="settingToggle"><input type="checkbox" checked={settings.reducedMotion} onChange={(e)=>setSettings((current)=>({...current,reducedMotion:e.target.checked}))}/><span><strong>Reduce motion</strong><small>Reduce non-essential UI movement.</small></span></label>
              <label className="settingToggle"><input type="checkbox" checked={settings.compact} onChange={(e)=>setSettings((current)=>({...current,compact:e.target.checked}))}/><span><strong>Compact density</strong><small>Use denser tables and operational surfaces.</small></span></label>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
