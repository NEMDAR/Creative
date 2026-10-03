"use client";

import { ChangeEvent, PointerEvent as ReactPointerEvent, useMemo, useRef, useState } from "react";
import type { CreatorProject, Overlay, RatioKey, TextOverlay } from "../lib/editor/types";

const RATIOS: Record<RatioKey, { w: number; h: number }> = {
  "9:16": { w: 9, h: 16 },
  "1:1": { w: 1, h: 1 },
  "4:5": { w: 4, h: 5 },
  "16:9": { w: 16, h: 9 },
};

const initialProject: CreatorProject = {
  schemaVersion: 1,
  name: "Untitled Creative",
  ratio: "9:16",
  trimStart: 0,
  trimEnd: null,
  volume: 1,
  muted: false,
  overlays: [],
};

type MediaState = { kind: "video" | "image"; url: string; name: string } | null;

export default function PhaseOneEditor() {
  const [project, setProject] = useState<CreatorProject>(initialProject);
  const [media, setMedia] = useState<MediaState>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const mediaObjectUrls = useRef<string[]>([]);

  const selected = useMemo(
    () => project.overlays.find((overlay) => overlay.id === selectedId) ?? null,
    [project.overlays, selectedId]
  );

  function replaceProject(updater: (current: CreatorProject) => CreatorProject) {
    setProject((current) => updater(current));
  }

  function createObjectUrl(file: File) {
    const url = URL.createObjectURL(file);
    mediaObjectUrls.current.push(url);
    return url;
  }

  function onMediaUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
    if (!kind) return alert("Please select a video or image file.");
    setMedia({ kind, url: createObjectUrl(file), name: file.name });
    setDuration(0);
    replaceProject((p) => ({ ...p, trimStart: 0, trimEnd: null }));
  }

  function addText() {
    const id = crypto.randomUUID();
    const overlay: TextOverlay = {
      id,
      kind: "text",
      text: "اكتب رسالتك هنا",
      x: 50,
      y: 22,
      fontSize: 44,
      fontWeight: 700,
      color: "#ffffff",
      opacity: 1,
      align: "center",
      direction: "rtl",
    };
    replaceProject((p) => ({ ...p, overlays: [...p.overlays, overlay] }));
    setSelectedId(id);
  }

  function addLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const id = crypto.randomUUID();
    const overlay: Overlay = {
      id,
      kind: "image",
      src: createObjectUrl(file),
      x: 80,
      y: 10,
      width: 18,
      opacity: 1,
    };
    replaceProject((p) => ({ ...p, overlays: [...p.overlays, overlay] }));
    setSelectedId(id);
  }

  function updateOverlay(id: string, patch: Partial<Overlay>) {
    replaceProject((p) => ({
      ...p,
      overlays: p.overlays.map((overlay) =>
        overlay.id === id ? ({ ...overlay, ...patch } as Overlay) : overlay
      ),
    }));
  }

  function deleteSelected() {
    if (!selectedId) return;
    replaceProject((p) => ({ ...p, overlays: p.overlays.filter((o) => o.id !== selectedId) }));
    setSelectedId(null);
  }

  function dragOverlay(event: ReactPointerEvent<HTMLDivElement>, overlay: Overlay) {
    const stage = stageRef.current;
    if (!stage) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(overlay.id);
    const rect = stage.getBoundingClientRect();
    const onMove = (e: PointerEvent) => {
      const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
      updateOverlay(overlay.id, { x, y } as Partial<Overlay>);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function saveDraft() {
    const serializable = {
      ...project,
      overlays: project.overlays.filter((o) => o.kind === "text"),
      note: "Local media files are intentionally not persisted in the P0 bootstrap.",
    };
    localStorage.setItem("nemdar-creator-phase1", JSON.stringify(serializable));
    alert("Project settings saved locally. Re-select media after a browser restart in this bootstrap build.");
  }

  function loadDraft() {
    const raw = localStorage.getItem("nemdar-creator-phase1");
    if (!raw) return alert("No local draft found.");
    const parsed = JSON.parse(raw) as CreatorProject;
    setProject({ ...initialProject, ...parsed });
    setSelectedId(null);
  }

  async function exportCurrentFrame() {
    if (!media) return alert("Upload media first.");
    const ratio = RATIOS[project.ratio];
    const canvas = document.createElement("canvas");
    const longSide = 1280;
    if (ratio.h >= ratio.w) {
      canvas.height = longSide;
      canvas.width = Math.round((longSide * ratio.w) / ratio.h);
    } else {
      canvas.width = longSide;
      canvas.height = Math.round((longSide * ratio.h) / ratio.w);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const source = media.kind === "video"
      ? videoRef.current
      : (document.getElementById("creator-image") as HTMLImageElement | null);
    if (!source) return;
    drawCover(ctx, source, canvas.width, canvas.height);

    for (const overlay of project.overlays) {
      if (overlay.kind === "text") {
        ctx.save();
        ctx.globalAlpha = overlay.opacity;
        ctx.fillStyle = overlay.color;
        ctx.font = `${overlay.fontWeight} ${overlay.fontSize * (canvas.width / 720)}px Arial, sans-serif`;
        ctx.textAlign = overlay.align;
        ctx.direction = overlay.direction;
        const x = (overlay.x / 100) * canvas.width;
        const y = (overlay.y / 100) * canvas.height;
        ctx.fillText(overlay.text, x, y);
        ctx.restore();
      } else {
        const image = new Image();
        image.src = overlay.src;
        await image.decode();
        const width = (overlay.width / 100) * canvas.width;
        const height = width * (image.naturalHeight / image.naturalWidth);
        ctx.save();
        ctx.globalAlpha = overlay.opacity;
        ctx.drawImage(image, (overlay.x / 100) * canvas.width - width / 2, (overlay.y / 100) * canvas.height - height / 2, width, height);
        ctx.restore();
      }
    }

    const link = document.createElement("a");
    link.download = `${project.name.replace(/[^a-z0-9-_]+/gi, "-")}-frame.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function drawCover(
    ctx: CanvasRenderingContext2D,
    source: HTMLVideoElement | HTMLImageElement,
    w: number,
    h: number
  ) {
    const sw = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
    const sh = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
    const safeW = sw || w;
    const safeH = sh || h;
    const scale = Math.max(w / safeW, h / safeH);
    const dw = safeW * scale;
    const dh = safeH * scale;
    ctx.drawImage(source, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  const ratio = RATIOS[project.ratio];

  return (
    <main className="appShell">
      <header className="topbar">
        <div>
          <span className="eyebrow">NEMDAR</span>
          <strong>Creator</strong>
          <span className="phaseChip">P0/P1 bootstrap</span>
        </div>
        <div className="topActions">
          <button className="ghost" onClick={loadDraft}>Load draft</button>
          <button className="ghost" onClick={saveDraft}>Save draft</button>
          <button className="primary" onClick={exportCurrentFrame}>Export frame</button>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel leftPanel">
          <h2>Assets</h2>
          <label className="uploadBox">
            <span>Upload video or image</span>
            <small>Local preview — no upload to a server yet</small>
            <input type="file" accept="video/*,image/*" onChange={onMediaUpload} hidden />
          </label>
          {media && <div className="assetCard"><span>{media.kind}</span><strong title={media.name}>{media.name}</strong></div>}

          <h2>Elements</h2>
          <button className="toolButton" onClick={addText}>+ Text</button>
          <label className="toolButton fileButton">+ Logo / image<input type="file" accept="image/*" onChange={addLogo} hidden /></label>

          <h2>Format</h2>
          <div className="ratioGrid">
            {(Object.keys(RATIOS) as RatioKey[]).map((key) => (
              <button
                key={key}
                className={project.ratio === key ? "ratio active" : "ratio"}
                onClick={() => replaceProject((p) => ({ ...p, ratio: key }))}
              >
                {key}
              </button>
            ))}
          </div>
        </aside>

        <section className="stageArea">
          <div className="stageWrap">
            <div ref={stageRef} className="stage" style={{ aspectRatio: `${ratio.w}/${ratio.h}` }}>
              {!media && <div className="emptyStage"><b>Drop in your first creative</b><span>Video + text + logo + social ratio</span></div>}
              {media?.kind === "video" && (
                <video
                  ref={videoRef}
                  src={media.url}
                  controls
                  playsInline
                  muted={project.muted}
                  volume={project.volume}
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration || 0;
                    setDuration(d);
                    replaceProject((p) => ({ ...p, trimEnd: p.trimEnd ?? d }));
                  }}
                  className="mediaLayer"
                />
              )}
              {media?.kind === "image" && <img id="creator-image" src={media.url} alt="Creative source" className="mediaLayer" />}

              {project.overlays.map((overlay) => (
                <div
                  key={overlay.id}
                  className={selectedId === overlay.id ? "overlay selected" : "overlay"}
                  style={{ left: `${overlay.x}%`, top: `${overlay.y}%` }}
                  onPointerDown={(e) => dragOverlay(e, overlay)}
                  onClick={() => setSelectedId(overlay.id)}
                >
                  {overlay.kind === "text" ? (
                    <span
                      style={{
                        fontSize: `${Math.max(12, overlay.fontSize * 0.55)}px`,
                        fontWeight: overlay.fontWeight,
                        color: overlay.color,
                        opacity: overlay.opacity,
                        textAlign: overlay.align,
                        direction: overlay.direction,
                      }}
                    >
                      {overlay.text}
                    </span>
                  ) : (
                    <img
                      src={overlay.src}
                      alt="Overlay"
                      style={{ width: `${Math.max(56, overlay.width * 4)}px`, opacity: overlay.opacity }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="transport">
            <span>Phase 1 target</span>
            <strong>Upload → Text → Logo → 9:16 → Trim → Export</strong>
          </div>

          <div className="miniTimeline">
            <div className="trackLabel">Source</div>
            <div className="clip">{media?.name || "No media selected"}</div>
            <div className="trackLabel">Overlays</div>
            <div className="overlayTrack">{project.overlays.map((o) => <span key={o.id}>{o.kind}</span>)}</div>
          </div>
        </section>

        <aside className="panel inspector">
          <h2>Project</h2>
          <label>Name<input value={project.name} onChange={(e) => replaceProject((p) => ({ ...p, name: e.target.value }))} /></label>
          {media?.kind === "video" && (
            <>
              <h2>Video</h2>
              <label>Trim start<input type="number" min={0} max={duration} step="0.1" value={project.trimStart} onChange={(e) => replaceProject((p) => ({ ...p, trimStart: Number(e.target.value) }))} /></label>
              <label>Trim end<input type="number" min={0} max={duration} step="0.1" value={project.trimEnd ?? duration} onChange={(e) => replaceProject((p) => ({ ...p, trimEnd: Number(e.target.value) }))} /></label>
              <label>Volume<input type="range" min="0" max="1" step="0.05" value={project.volume} onChange={(e) => replaceProject((p) => ({ ...p, volume: Number(e.target.value) }))} /></label>
              <label className="check"><input type="checkbox" checked={project.muted} onChange={(e) => replaceProject((p) => ({ ...p, muted: e.target.checked }))} /> Muted</label>
            </>
          )}

          <h2>Selected element</h2>
          {!selected && <p className="hint">Select a text or logo on the stage.</p>}
          {selected?.kind === "text" && (
            <>
              <label>Text<textarea value={selected.text} dir="auto" onChange={(e) => updateOverlay(selected.id, { text: e.target.value } as Partial<Overlay>)} /></label>
              <label>Font size<input type="range" min="18" max="96" value={selected.fontSize} onChange={(e) => updateOverlay(selected.id, { fontSize: Number(e.target.value) } as Partial<Overlay>)} /></label>
              <label>Weight<select value={selected.fontWeight} onChange={(e) => updateOverlay(selected.id, { fontWeight: Number(e.target.value) } as Partial<Overlay>)}><option value="400">Regular</option><option value="600">Semi Bold</option><option value="700">Bold</option><option value="800">Extra Bold</option></select></label>
              <label>Color<input type="color" value={selected.color} onChange={(e) => updateOverlay(selected.id, { color: e.target.value } as Partial<Overlay>)} /></label>
              <label>Direction<select value={selected.direction} onChange={(e) => updateOverlay(selected.id, { direction: e.target.value as "rtl" | "ltr" } as Partial<Overlay>)}><option value="rtl">RTL</option><option value="ltr">LTR</option></select></label>
            </>
          )}
          {selected?.kind === "image" && <label>Logo width<input type="range" min="5" max="50" value={selected.width} onChange={(e) => updateOverlay(selected.id, { width: Number(e.target.value) } as Partial<Overlay>)} /></label>}
          {selected && <button className="danger" onClick={deleteSelected}>Delete selected</button>}

          <div className="notice">
            <b>Bootstrap limitation</b>
            <span>Current export is a still frame. Full timed video render is tracked as NC-P1-13 and will use the render contract already scaffolded.</span>
          </div>
        </aside>
      </section>
    </main>
  );
}
