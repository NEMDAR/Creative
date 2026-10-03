"use client";

import { ChangeEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CreatorProject, Overlay, RatioKey, TextOverlay } from "../lib/editor/types";
import { loadPhaseOneDraft, savePhaseOneDraft } from "../lib/editor/storage";
import { buildSequentialTimeline, createEmptyTimeline, formatTimelineTime, resolveTimelineTime, setTimelinePlayhead, timelineTimeForSource } from "../lib/editor/timeline";

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

type MediaItem = { id: string; kind: "video" | "image"; url: string; name: string; type: string; blob: Blob; duration: number };
type MediaState = MediaItem | null;

export default function PhaseOneEditor() {
  const [project, setProject] = useState<CreatorProject>(initialProject);
  const [media, setMedia] = useState<MediaState>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [timeline, setTimeline] = useState(createEmptyTimeline);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const mediaObjectUrls = useRef<string[]>([]);
  const pendingSeekRef = useRef<{ assetId: string; sourceTime: number } | null>(null);
  const isExportingRef = useRef(false);
  const [exportState, setExportState] = useState<"idle" | "rendering" | "done" | "error">("idle");
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const undoStack = useRef<CreatorProject[]>([]);
  const redoStack = useRef<CreatorProject[]>([]);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.volume = project.volume;
    videoRef.current.muted = project.muted;
  }, [project.volume, project.muted, media]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || media?.kind !== "video" || mediaItems.length > 1) return;
    const trimEnd = project.trimEnd ?? duration;
    if (video.currentTime < project.trimStart || video.currentTime > trimEnd) {
      video.currentTime = project.trimStart;
    }
  }, [project.trimStart, project.trimEnd, duration, media, mediaItems.length]);

  useEffect(() => {
    if (mediaItems.length === 0) {
      setTimeline(createEmptyTimeline());
      return;
    }

    const singleSource = mediaItems.length === 1;
    const inputs = mediaItems.map((item) => {
      if (singleSource && item.kind === "video") {
        const end = project.trimEnd ?? item.duration;
        return {
          assetId: item.id,
          assetName: item.name,
          kind: item.kind,
          sourceStart: project.trimStart,
          sourceDuration: item.duration,
          duration: Math.max(0, end - project.trimStart),
        };
      }

      return {
        assetId: item.id,
        assetName: item.name,
        kind: item.kind,
        sourceStart: 0,
        sourceDuration: item.kind === "video" ? item.duration : null,
        duration: item.duration,
      };
    });

    setTimeline((current) =>
      buildSequentialTimeline(inputs, current.playhead)
    );
  }, [mediaItems, project.trimStart, project.trimEnd]);

  const selected = useMemo(
    () => project.overlays.find((overlay) => overlay.id === selectedId) ?? null,
    [project.overlays, selectedId]
  );

  function replaceProject(
    updater: (current: CreatorProject) => CreatorProject,
    recordHistory = true
  ) {
    setProject((current) => {
      const next = updater(current);
      if (recordHistory && JSON.stringify(next) !== JSON.stringify(current)) {
        undoStack.current.push(current);
        if (undoStack.current.length > 100) undoStack.current.shift();
        redoStack.current = [];
      }
      return next;
    });
  }

  function undo() {
    const previous = undoStack.current.pop();
    if (!previous) return;
    setProject((current) => {
      redoStack.current.push(current);
      return previous;
    });
  }

  function redo() {
    const next = redoStack.current.pop();
    if (!next) return;
    setProject((current) => {
      undoStack.current.push(current);
      return next;
    });
  }

  function createObjectUrl(file: Blob) {
    const url = URL.createObjectURL(file);
    mediaObjectUrls.current.push(url);
    return url;
  }

  async function onMediaUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const nextItems: MediaItem[] = [];
    for (const file of files) {
      const kind = file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("image/")
          ? "image"
          : null;
      if (!kind) continue;

      const url = createObjectUrl(file);
      const itemDuration = await probeMediaDuration(url, kind);
      nextItems.push({
        id: crypto.randomUUID(),
        kind,
        url,
        name: file.name,
        type: file.type,
        blob: file,
        duration: itemDuration,
      });
    }

    if (nextItems.length === 0) {
      alert("Please select supported video or image files.");
      return;
    }

    setMediaItems((current) => [...current, ...nextItems]);

    if (!media) {
      const first = nextItems[0];
      setMedia(first);
      setDuration(first.kind === "video" ? first.duration : 0);
      replaceProject((p) => ({ ...p, trimStart: 0, trimEnd: null }));
    }

    event.target.value = "";
  }

  function probeMediaDuration(url: string, kind: "video" | "image") {
    if (kind === "image") return Promise.resolve(5);

    return new Promise<number>((resolve) => {
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.src = url;
      probe.onloadedmetadata = () => {
        const value = Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 5;
        resolve(value);
      };
      probe.onerror = () => resolve(5);
    });
  }

  function selectMediaItem(item: MediaItem) {
    setMedia(item);
    setDuration(item.kind === "video" ? item.duration : 0);
    const clip = timeline.tracks[0]?.clips.find((entry) => entry.assetId === item.id);
    if (clip) {
      setTimeline((current) => setTimelinePlayhead(current, clip.timelineStart));
      if (item.kind === "video") {
        pendingSeekRef.current = { assetId: item.id, sourceTime: clip.sourceStart };
      }
    }
  }

  function moveMediaItem(id: string, direction: -1 | 1) {
    setMediaItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
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
    const reader = new FileReader();
    reader.onload = () => {
      const id = crypto.randomUUID();
      const overlay: Overlay = {
        id,
        kind: "image",
        src: String(reader.result),
        x: 80,
        y: 10,
        width: 18,
        opacity: 1,
      };
      replaceProject((p) => ({ ...p, overlays: [...p.overlays, overlay] }));
      setSelectedId(id);
    };
    reader.readAsDataURL(file);
  }

  function updateOverlay(id: string, patch: Partial<Overlay>, recordHistory = true) {
    replaceProject((p) => ({
      ...p,
      overlays: p.overlays.map((overlay) =>
        overlay.id === id ? ({ ...overlay, ...patch } as Overlay) : overlay
      ),
    }), recordHistory);
  }

  function deleteSelected() {
    if (!selectedId) return;
    replaceProject((p) => ({ ...p, overlays: p.overlays.filter((o) => o.id !== selectedId) }));
    setSelectedId(null);
  }

  function scrubTimeline(event: ReactMouseEvent<HTMLDivElement>) {
    if (timeline.duration <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const timelineTime = timeline.duration * ratio;
    const resolved = resolveTimelineTime(timeline, timelineTime);
    setTimeline((current) => setTimelinePlayhead(current, timelineTime));

    if (!resolved) return;
    const item = mediaItems.find((candidate) => candidate.id === resolved.clip.assetId);
    if (!item) return;

    if (media?.id !== item.id) {
      pendingSeekRef.current =
        item.kind === "video"
          ? { assetId: item.id, sourceTime: resolved.sourceTime }
          : null;
      setMedia(item);
      setDuration(item.kind === "video" ? item.duration : 0);
      return;
    }

    if (item.kind === "video" && videoRef.current) {
      videoRef.current.currentTime = resolved.sourceTime;
    }
  }

  function dragOverlay(event: ReactPointerEvent<HTMLDivElement>, overlay: Overlay) {
    const stage = stageRef.current;
    if (!stage) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(overlay.id);
    const rect = stage.getBoundingClientRect();
    const beforeDrag = project;
    let moved = false;
    const onMove = (e: PointerEvent) => {
      moved = true;
      const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
      updateOverlay(overlay.id, { x, y } as Partial<Overlay>, false);
    };
    const onUp = () => {
      if (moved) {
        undoStack.current.push(beforeDrag);
        if (undoStack.current.length > 100) undoStack.current.shift();
        redoStack.current = [];
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  async function saveDraft() {
    try {
      await savePhaseOneDraft(
        project,
        media
          ? {
              kind: media.kind,
              name: media.name,
              type: media.type,
              blob: media.blob,
            }
          : null
      );
      localStorage.setItem("nemdar-creative-studio-phase1", JSON.stringify(project));
      alert(mediaItems.length > 1 ? "Selected clip saved locally. Full multi-clip autosave arrives in P2 snapshots." : "Project and source media saved locally in this browser.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save the local draft.";
      alert(message);
    }
  }

  async function loadDraft() {
    try {
      const draft = await loadPhaseOneDraft();
      if (draft) {
        replaceProject(() => ({ ...initialProject, ...draft.project }));
        if (draft.media) {
          const restored: MediaItem = {
            id: crypto.randomUUID(),
            kind: draft.media.kind,
            name: draft.media.name,
            type: draft.media.type,
            blob: draft.media.blob,
            url: createObjectUrl(draft.media.blob),
            duration: draft.media.kind === "image" ? 5 : 0,
          };
          setMedia(restored);
          setMediaItems([restored]);
        } else {
          setMedia(null);
          setMediaItems([]);
        }
        setSelectedId(null);
        return;
      }

      const legacy = localStorage.getItem("nemdar-creative-studio-phase1");
      if (!legacy) return alert("No local draft found.");
      const parsed = JSON.parse(legacy) as CreatorProject;
      replaceProject(() => ({ ...initialProject, ...parsed }));
      setSelectedId(null);
      alert("Legacy project settings restored. Save again to migrate the draft to durable browser storage.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load the local draft.";
      alert(message);
    }
  }

  async function exportAsset() {
    if (!media) return alert("Upload media first.");
    setExportError(null);
    if (media.kind === "image") {
      await exportCurrentFrame();
      setExportState("done");
      setExportProgress(100);
      return;
    }
    await exportVideo();
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
      : (document.getElementById("creative-image") as HTMLImageElement | null);
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

  async function loadOverlayImages() {
    const images = new Map<string, HTMLImageElement>();
    for (const overlay of project.overlays) {
      if (overlay.kind !== "image") continue;
      const image = new Image();
      image.src = overlay.src;
      await image.decode();
      images.set(overlay.id, image);
    }
    return images;
  }

  function drawCompositionFrame(
    ctx: CanvasRenderingContext2D,
    source: HTMLVideoElement | HTMLImageElement,
    width: number,
    height: number,
    overlayImages: Map<string, HTMLImageElement>
  ) {
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, width, height);
    drawCover(ctx, source, width, height);

    for (const overlay of project.overlays) {
      if (overlay.kind === "text") {
        ctx.save();
        ctx.globalAlpha = overlay.opacity;
        ctx.fillStyle = overlay.color;
        ctx.font = `${overlay.fontWeight} ${overlay.fontSize * (width / 720)}px Arial, sans-serif`;
        ctx.textAlign = overlay.align;
        ctx.direction = overlay.direction;
        ctx.fillText(overlay.text, (overlay.x / 100) * width, (overlay.y / 100) * height);
        ctx.restore();
        continue;
      }

      const image = overlayImages.get(overlay.id);
      if (!image) continue;
      const renderedWidth = (overlay.width / 100) * width;
      const renderedHeight = renderedWidth * (image.naturalHeight / image.naturalWidth);
      ctx.save();
      ctx.globalAlpha = overlay.opacity;
      ctx.drawImage(
        image,
        (overlay.x / 100) * width - renderedWidth / 2,
        (overlay.y / 100) * height - renderedHeight / 2,
        renderedWidth,
        renderedHeight
      );
      ctx.restore();
    }
  }

  async function exportVideo() {
    const video = videoRef.current;
    if (!video || media?.kind !== "video") return;

    const singleSource = mediaItems.length <= 1;
    const start = singleSource ? Math.max(0, project.trimStart) : 0;
    const end = singleSource ? Math.min(project.trimEnd ?? duration, duration) : duration;
    if (!Number.isFinite(end) || end <= start) {
      setExportState("error");
      setExportError("Trim end must be after trim start.");
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      setExportState("error");
      setExportError("This browser does not support in-browser video recording.");
      return;
    }

    const canvas = document.createElement("canvas");
    const ratio = RATIOS[project.ratio];
    const longSide = 1080;
    if (ratio.h >= ratio.w) {
      canvas.height = longSide;
      canvas.width = Math.round((longSide * ratio.w) / ratio.h);
    } else {
      canvas.width = longSide;
      canvas.height = Math.round((longSide * ratio.h) / ratio.w);
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setExportState("error");
      setExportError("Unable to initialize the video renderer.");
      return;
    }

    const canvasStream = canvas.captureStream(30);
    const captureVideo = video as HTMLVideoElement & { captureStream?: () => MediaStream };
    let exportAudioContext: AudioContext | null = null;

    if (!project.muted && captureVideo.captureStream) {
      try {
        const sourceStream = captureVideo.captureStream();
        if (sourceStream.getAudioTracks().length > 0) {
          exportAudioContext = new AudioContext();
          const sourceNode = exportAudioContext.createMediaStreamSource(sourceStream);
          const gainNode = exportAudioContext.createGain();
          const destinationNode = exportAudioContext.createMediaStreamDestination();

          gainNode.gain.value = project.volume;
          sourceNode.connect(gainNode);
          gainNode.connect(destinationNode);

          if (exportAudioContext.state === "suspended") {
            await exportAudioContext.resume();
          }

          destinationNode.stream
            .getAudioTracks()
            .forEach((track) => canvasStream.addTrack(track));
        }
      } catch (error) {
        if (exportAudioContext) {
          await exportAudioContext.close().catch(() => undefined);
        }
        setExportState("error");
        setExportError(
          error instanceof Error ? error.message : "Unable to prepare export audio."
        );
        return;
      }
    }

    const mimeType = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((candidate) => MediaRecorder.isTypeSupported(candidate));

    const recorder = new MediaRecorder(canvasStream, mimeType ? { mimeType } : undefined);
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    const overlayImages = await loadOverlayImages();
    const originalTime = video.currentTime;
    const originalMuted = video.muted;
    const wasPaused = video.paused;

    setExportState("rendering");
    setExportProgress(0);
    setExportError(null);
    isExportingRef.current = true;

    try {
      await seekVideo(video, start);

      const stopped = new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = () => reject(new Error("Video recording failed."));
      });

      const exportDurationMs = Math.max(1, (end - start) * 1000);
      video.muted = true;
      drawCompositionFrame(ctx, video, canvas.width, canvas.height, overlayImages);
      recorder.start(250);
      void video.play().catch(() => undefined);

      await new Promise<void>((resolve, reject) => {
        const startedAt = performance.now();

        const render = () => {
          try {
            if (video.readyState >= 2) {
              drawCompositionFrame(ctx, video, canvas.width, canvas.height, overlayImages);
            }

            const elapsedMs = performance.now() - startedAt;
            const desiredTime = Math.min(end, start + elapsedMs / 1000);
            if (!video.seeking && Math.abs(video.currentTime - desiredTime) > 0.18) {
              video.currentTime = desiredTime;
            }
            const progress = Math.max(0, Math.min(1, elapsedMs / exportDurationMs));
            setExportProgress(Math.round(progress * 100));

            if (elapsedMs >= exportDurationMs || video.currentTime >= end - 0.025 || video.ended) {
              video.pause();
              video.muted = originalMuted;
              if (recorder.state !== "inactive") recorder.stop();
              resolve();
              return;
            }

            window.setTimeout(render, 1000 / 30);
          } catch (error) {
            video.muted = originalMuted;
            reject(error);
          }
        };

        window.setTimeout(render, 1000 / 30);
      });

      await stopped;

      const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
      if (!blob.size) throw new Error("The browser produced an empty video file.");

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${project.name.replace(/[^a-z0-9-_]+/gi, "-") || "creative"}-${project.ratio.replace(":", "x")}.webm`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);

      setExportProgress(100);
      setExportState("done");
    } catch (error) {
      if (recorder.state !== "inactive") recorder.stop();
      setExportState("error");
      setExportError(error instanceof Error ? error.message : "Video export failed.");
    } finally {
      isExportingRef.current = false;
      video.muted = originalMuted;
      if (exportAudioContext) {
        await exportAudioContext.close().catch(() => undefined);
      }
      await seekVideo(video, Math.min(originalTime, duration || originalTime)).catch(() => undefined);
      if (!wasPaused) void video.play().catch(() => undefined);
    }
  }

  function seekVideo(video: HTMLVideoElement, time: number) {
    if (Math.abs(video.currentTime - time) < 0.03) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const onSeeked = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Unable to seek the source video."));
      };
      const cleanup = () => {
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
      };
      video.addEventListener("seeked", onSeeked, { once: true });
      video.addEventListener("error", onError, { once: true });
      video.currentTime = time;
    });
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
          <strong>Creative Studio</strong>
          <span className="phaseChip">P2 timeline foundation</span>
        </div>
        <div className="topActions">
          <button className="ghost" onClick={undo}>Undo</button>
          <button className="ghost" onClick={redo}>Redo</button>
          <button className="ghost" onClick={loadDraft}>Load draft</button>
          <button className="ghost" onClick={saveDraft}>Save draft</button>
          <button className="primary" onClick={exportAsset} disabled={exportState === "rendering"}>{exportState === "rendering" ? `Exporting ${exportProgress}%` : media?.kind === "video" ? "Export video" : "Export frame"}</button>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel leftPanel">
          <h2>Assets</h2>
          <label className="uploadBox">
            <span>Upload videos or images</span>
            <small>Add one or multiple clips to Visual 1</small>
            <input type="file" accept="video/*,image/*" multiple onChange={onMediaUpload} hidden />
          </label>
          <div className="assetList">
            {mediaItems.map((item, index) => (
              <div
                className={media?.id === item.id ? "assetCard active" : "assetCard"}
                key={item.id}
                onClick={() => selectMediaItem(item)}
              >
                <span>{item.kind}</span>
                <strong title={item.name}>{item.name}</strong>
                <div className="assetActions">
                  <button
                    type="button"
                    aria-label={`Move ${item.name} earlier`}
                    disabled={index === 0}
                    onClick={(event) => {
                      event.stopPropagation();
                      moveMediaItem(item.id, -1);
                    }}
                  >↑</button>
                  <button
                    type="button"
                    aria-label={`Move ${item.name} later`}
                    disabled={index === mediaItems.length - 1}
                    onClick={(event) => {
                      event.stopPropagation();
                      moveMediaItem(item.id, 1);
                    }}
                  >↓</button>
                </div>
              </div>
            ))}
          </div>

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
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration || media.duration || 0;
                    setDuration(d);
                    setMediaItems((current) =>
                      current.map((item) =>
                        item.id === media.id ? { ...item, duration: d } : item
                      )
                    );

                    const pending = pendingSeekRef.current;
                    if (pending?.assetId === media.id) {
                      e.currentTarget.currentTime = pending.sourceTime;
                      pendingSeekRef.current = null;
                    } else if (mediaItems.length <= 1) {
                      e.currentTarget.currentTime = project.trimStart;
                      replaceProject((p) => ({ ...p, trimEnd: p.trimEnd ?? d }), false);
                    } else {
                      e.currentTarget.currentTime = 0;
                    }
                  }}
                  onPlay={(e) => {
                    const singleSource = mediaItems.length <= 1;
                    const start = singleSource ? project.trimStart : 0;
                    const end = singleSource ? (project.trimEnd ?? duration) : duration;
                    if (e.currentTarget.currentTime < start || e.currentTarget.currentTime >= end) {
                      e.currentTarget.currentTime = start;
                    }
                  }}
                  onTimeUpdate={(e) => {
                    const singleSource = mediaItems.length <= 1;
                    const start = singleSource ? project.trimStart : 0;
                    const end = singleSource ? (project.trimEnd ?? duration) : duration;
                    const timelineTime = timelineTimeForSource(timeline, media.id, e.currentTarget.currentTime);
                    if (timelineTime !== null) {
                      setTimeline((current) => setTimelinePlayhead(current, timelineTime));
                    }
                    if (!isExportingRef.current && end > start && e.currentTarget.currentTime >= end) {
                      e.currentTarget.pause();
                      e.currentTarget.currentTime = start;
                      const resetTime = timelineTimeForSource(timeline, media.id, start);
                      if (resetTime !== null) {
                        setTimeline((current) => setTimelinePlayhead(current, resetTime));
                      }
                    }
                  }}
                  className="mediaLayer"
                />
              )}
              {media?.kind === "image" && <img id="creative-image" src={media.url} alt="Creative source" className="mediaLayer" />}

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
            <span>Phase 2 target</span>
            <strong>Timeline model → Playhead → Multi-clip</strong>
            {exportState === "rendering" && <span className="exportState">Rendering {exportProgress}%</span>}
            {exportState === "done" && <span className="exportState success">Export ready</span>}
            {exportState === "error" && <span className="exportState error">{exportError}</span>}
          </div>

          <div className="timelinePanel">
            <div className="timelineHeader">
              <span>Timeline</span>
              <strong data-testid="timeline-clock">{formatTimelineTime(timeline.playhead)}</strong>
              <span>/ {formatTimelineTime(timeline.duration)}</span>
            </div>
            <div className="timelineRow">
              <div className="trackLabel">Visual 1</div>
              <div
                className="timelineSurface"
                data-testid="timeline-surface"
                onClick={scrubTimeline}
              >
                {timeline.tracks[0]?.clips.map((clip) => (
                  <div
                    className={media?.id === clip.assetId ? "clip timelineClip active" : "clip timelineClip"}
                    key={clip.id}
                    data-testid="timeline-clip"
                    style={{
                      left: `${timeline.duration > 0 ? (clip.timelineStart / timeline.duration) * 100 : 0}%`,
                      width: `${timeline.duration > 0 ? (clip.duration / timeline.duration) * 100 : 0}%`,
                    }}
                    onClick={() => {
                      const item = mediaItems.find((candidate) => candidate.id === clip.assetId);
                      if (item) selectMediaItem(item);
                    }}
                  >
                    <strong>{clip.assetName}</strong>
                    <span>{formatTimelineTime(clip.duration)}</span>
                  </div>
                ))}
                <div
                  className="timelinePlayhead"
                  data-testid="timeline-playhead"
                  style={{
                    left: `${timeline.duration > 0 ? (timeline.playhead / timeline.duration) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
            <div className="timelineRow">
              <div className="trackLabel">Overlays</div>
              <div className="overlayTrack">
                {project.overlays.map((o) => <span key={o.id}>{o.kind}</span>)}
              </div>
            </div>
          </div>
        </section>

        <aside className="panel inspector">
          <h2>Project</h2>
          <label>Name<input value={project.name} onChange={(e) => replaceProject((p) => ({ ...p, name: e.target.value }))} /></label>
          {mediaItems.length <= 1 && media?.kind === "video" && (
            <>
              <h2>Video</h2>
              <label>Trim start<input type="number" min={0} max={project.trimEnd ?? duration} step="0.1" value={project.trimStart} onChange={(e) => {
                const value = Math.max(0, Math.min(Number(e.target.value), project.trimEnd ?? duration));
                replaceProject((p) => ({ ...p, trimStart: value }));
              }} /></label>
              <label>Trim end<input type="number" min={project.trimStart} max={duration} step="0.1" value={project.trimEnd ?? duration} onChange={(e) => {
                const value = Math.max(project.trimStart, Math.min(Number(e.target.value), duration));
                replaceProject((p) => ({ ...p, trimEnd: value }));
              }} /></label>
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
              <label>Alignment<select value={selected.align} onChange={(e) => updateOverlay(selected.id, { align: e.target.value as "left" | "center" | "right" } as Partial<Overlay>)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
              <label>Opacity<input type="range" min="0.1" max="1" step="0.05" value={selected.opacity} onChange={(e) => updateOverlay(selected.id, { opacity: Number(e.target.value) } as Partial<Overlay>)} /></label>
              <label>Direction<select value={selected.direction} onChange={(e) => updateOverlay(selected.id, { direction: e.target.value as "rtl" | "ltr" } as Partial<Overlay>)}><option value="rtl">RTL</option><option value="ltr">LTR</option></select></label>
            </>
          )}
          {selected?.kind === "image" && (
            <>
              <label>Logo width<input type="range" min="5" max="50" value={selected.width} onChange={(e) => updateOverlay(selected.id, { width: Number(e.target.value) } as Partial<Overlay>)} /></label>
              <label>Opacity<input type="range" min="0.1" max="1" step="0.05" value={selected.opacity} onChange={(e) => updateOverlay(selected.id, { opacity: Number(e.target.value) } as Partial<Overlay>)} /></label>
            </>
          )}
          {selected && <button className="danger" onClick={deleteSelected}>Delete selected</button>}

          <div className="notice">
            <b>P2 multi-clip foundation</b>
            <span>Visual 1 now accepts ordered multiple clips. Per-clip split/trim and durable multi-clip snapshots are handled by the next P2 cards.</span>
          </div>
        </aside>
      </section>
    </main>
  );
}
