"use client";

import { ChangeEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CAPTION_STYLE_PRESETS, captionCueAtTime, cloneCaptionStylePreset, normalizeCaptionStyle, normalizeCaptionTrack, type CaptionCue, type CaptionEmphasis, type CaptionLanguage, type CaptionPosition, type CaptionPresetId, type CaptionStyleConfig, type CaptionTrack } from "../lib/editor/captions";
import type { CreatorProject, Overlay, RatioKey, TextOverlay } from "../lib/editor/types";
import { listPhaseTwoSnapshots, loadPhaseOneDraft, loadPhaseTwoDraft, loadPhaseTwoSnapshot, savePhaseTwoDraft, savePhaseTwoSnapshot, type HydratedPhaseTwoState, type PhaseTwoSaveInput, type PhaseTwoSnapshotSummary } from "../lib/editor/storage";
import { buildSequentialTimeline, createEmptyTimeline, deleteTimelineClip, duplicateTimelineClip, formatTimelineTime, getMaxTransitionDuration, getNextTimelineClip, getTransitionVisualState, isCrossfadeEligible, moveTimelineClip, removeTimelineRange, resolveTimelineTime, setTimelineClipTransition, setTimelinePlayhead, splitTimelineClip, timelineTimeForClip, trimTimelineClip, updateTimelineClipTransform, type ClipFitMode, type TimelineClip, type TimelineState, type TransitionType } from "../lib/editor/timeline";
import type { ServerRenderManifest } from "../lib/render/server-types";

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
type AudioTrackItem = { id: string; url: string; name: string; type: string; blob: Blob; duration: number; startTime: number; gain: number; fadeIn: number; fadeOut: number };
type SilenceReviewRange = { id: string; startTime: number; endTime: number; duration: number; selected: boolean };
type SilenceSourceKind = "video" | "audio";
type SceneSuggestion = { id: string; time: number; selected: boolean };

type ServerRenderState = {
  jobId: string | null;
  status: "idle" | "queued" | "running" | "succeeded" | "failed";
  progress: number;
  stage: string;
  outputUrl?: string;
  error?: string;
};

function evenDimension(value: number) {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

function renderDimensions(ratio: RatioKey) {
  const shape = RATIOS[ratio];
  const longSide = 1080;
  if (shape.h >= shape.w) {
    return {
      width: evenDimension((longSide * shape.w) / shape.h),
      height: longSide,
    };
  }
  return {
    width: longSide,
    height: evenDimension((longSide * shape.h) / shape.w),
  };
}

function canvasPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Unable to create overlay PNG."));
    }, "image/png");
  });
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load overlay image."));
    image.src = src;
  });
}

function hexToRgba(hex: string, opacity: number) {
  const normalized = hex.replace("#", "").trim();
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6);
  const numeric = Number.parseInt(value, 16);
  const red = (numeric >> 16) & 255;
  const green = (numeric >> 8) & 255;
  const blue = numeric & 255;
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, opacity))})`;
}

type ReframeAnchor = {
  x: number;
  y: number;
  confidence: number;
};

function detectSaliencyAnchor(
  source: HTMLImageElement | HTMLVideoElement
): ReframeAnchor {
  const sourceWidth =
    source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const sourceHeight =
    source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;

  if (!sourceWidth || !sourceHeight) {
    return { x: 50, y: 50, confidence: 0 };
  }

  const maxSide = 96;
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(24, Math.round(sourceWidth * scale));
  const height = Math.max(24, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { x: 50, y: 50, confidence: 0 };

  ctx.drawImage(source, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  const luma = new Float32Array(width * height);
  let mean = 0;

  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    const value =
      data[offset] * 0.2126 +
      data[offset + 1] * 0.7152 +
      data[offset + 2] * 0.0722;
    luma[i] = value;
    mean += value;
  }
  mean /= width * height;

  let total = 0;
  let weightedX = 0;
  let weightedY = 0;
  const marginX = Math.max(1, Math.round(width * 0.04));
  const marginY = Math.max(1, Math.round(height * 0.04));

  for (let y = marginY; y < height - marginY; y += 1) {
    for (let x = marginX; x < width - marginX; x += 1) {
      const index = y * width + x;
      const gx = Math.abs(luma[index + 1] - luma[index - 1]);
      const gy = Math.abs(luma[index + width] - luma[index - width]);
      const contrast = Math.abs(luma[index] - mean);
      const offset = index * 4;
      const maxChannel = Math.max(
        data[offset],
        data[offset + 1],
        data[offset + 2]
      );
      const minChannel = Math.min(
        data[offset],
        data[offset + 1],
        data[offset + 2]
      );
      const saturation = maxChannel - minChannel;
      const centerPrior =
        0.65 +
        0.35 *
          (1 -
            Math.min(
              1,
              Math.hypot(
                x / Math.max(1, width - 1) - 0.5,
                y / Math.max(1, height - 1) - 0.5
              ) / 0.72
            ));
      const weight =
        (gx * 1.5 + gy * 1.5 + contrast * 0.7 + saturation * 0.25) *
        centerPrior;

      if (weight <= 0.5) continue;
      total += weight;
      weightedX += x * weight;
      weightedY += y * weight;
    }
  }

  if (total <= 0) {
    return { x: 50, y: 50, confidence: 0 };
  }

  const x = Math.max(
    5,
    Math.min(95, (weightedX / total / Math.max(1, width - 1)) * 100)
  );
  const y = Math.max(
    5,
    Math.min(95, (weightedY / total / Math.max(1, height - 1)) * 100)
  );
  const confidence = Math.max(
    0,
    Math.min(1, total / (width * height * 80))
  );

  return {
    x: Number(x.toFixed(1)),
    y: Number(y.toFixed(1)),
    confidence: Number(confidence.toFixed(2)),
  };
}

function cutCaptionTrackRange(
  track: CaptionTrack | null,
  cutStart: number,
  cutEnd: number
): CaptionTrack | null {
  if (!track) return track;
  const cutDuration = Math.max(0, cutEnd - cutStart);
  if (cutDuration < 0.05) return track;

  const cues = track.cues
    .map((cue) => {
      if (cue.endTime <= cutStart) return cue;
      if (cue.startTime >= cutEnd) {
        return {
          ...cue,
          startTime: Math.max(0, cue.startTime - cutDuration),
          endTime: Math.max(0.05, cue.endTime - cutDuration),
        };
      }
      return null;
    })
    .filter((cue): cue is CaptionCue => Boolean(cue));

  return normalizeCaptionTrack({ ...track, cues });
}

function captionPreviewStyle(style: CaptionStyleConfig): CSSProperties {
  const position: CSSProperties =
    style.position === "top"
      ? { top: `${style.safeZone}%`, bottom: "auto" }
      : style.position === "center"
        ? { top: "50%", bottom: "auto", transform: "translate(-50%, -50%)" }
        : { bottom: `${style.safeZone}%`, top: "auto" };

  return {
    ...position,
    left: "50%",
    right: "auto",
    width: "max-content",
    maxWidth: `${style.maxWidth}%`,
    transform:
      style.position === "center"
        ? "translate(-50%, -50%)"
        : "translateX(-50%)",
    fontSize: `${style.fontSize}px`,
    fontWeight: style.fontWeight,
    color: style.textColor,
    backgroundColor: hexToRgba(style.backgroundColor, style.backgroundOpacity),
    textAlign: "center",
    lineHeight: 1.25,
    textShadow: style.shadow ? "0 2px 8px rgba(0,0,0,.72)" : "none",
    boxShadow:
      style.emphasis === "highlight"
        ? "0 0 0 2px rgba(255,255,255,.24)"
        : "none",
    letterSpacing: style.emphasis === "bold" ? ".01em" : "normal",
  };
}

async function rasterizeOverlayAsset(
  overlay: Overlay,
  outputWidth: number,
  outputHeight: number
) {
  if (overlay.kind === "image") {
    const image = await loadImageElement(overlay.src);
    const width = Math.max(2, Math.round((overlay.width / 100) * outputWidth));
    const height = Math.max(
      2,
      Math.round(width * (image.naturalHeight / Math.max(1, image.naturalWidth)))
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to rasterize image overlay.");
    ctx.globalAlpha = overlay.opacity;
    ctx.drawImage(image, 0, 0, width, height);
    return { blob: await canvasPngBlob(canvas), width, height };
  }

  const scale = outputWidth / 720;
  const fontSize = Math.max(12, overlay.fontSize * scale);
  const padding = Math.max(8, Math.ceil(fontSize * 0.35));
  const lines = overlay.text.split(/\r?\n/);
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  if (!measureCtx) throw new Error("Unable to rasterize text overlay.");
  measureCtx.font = `${overlay.fontWeight} ${fontSize}px Arial, sans-serif`;
  const maxTextWidth = Math.max(
    1,
    ...lines.map((line) => measureCtx.measureText(line || " ").width)
  );
  const lineHeight = fontSize * 1.25;
  const width = Math.max(2, Math.ceil(maxTextWidth + padding * 2));
  const height = Math.max(2, Math.ceil(lines.length * lineHeight + padding * 2));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to rasterize text overlay.");
  ctx.font = `${overlay.fontWeight} ${fontSize}px Arial, sans-serif`;
  ctx.fillStyle = overlay.color;
  ctx.globalAlpha = overlay.opacity;
  ctx.textBaseline = "middle";
  ctx.textAlign = overlay.align;
  ctx.direction = overlay.direction;

  const x =
    overlay.align === "left"
      ? padding
      : overlay.align === "right"
        ? width - padding
        : width / 2;
  lines.forEach((line, index) => {
    ctx.fillText(
      line || " ",
      x,
      padding + lineHeight * (index + 0.5)
    );
  });

  return { blob: await canvasPngBlob(canvas), width, height };
}

export default function PhaseOneEditor() {
  const [project, setProject] = useState<CreatorProject>(initialProject);
  const [media, setMedia] = useState<MediaState>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [timeline, setTimeline] = useState(createEmptyTimeline);
  const [audioTrack, setAudioTrack] = useState<AudioTrackItem | null>(null);
  const [captions, setCaptions] = useState<CaptionTrack | null>(null);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyleConfig>(() => cloneCaptionStylePreset("clean"));
  const [captionLanguage, setCaptionLanguage] = useState<CaptionLanguage>("auto");
  const [captionState, setCaptionState] = useState<"idle" | "generating" | "ready" | "error">("idle");
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [selectedCaptionId, setSelectedCaptionId] = useState<string | null>(null);
  const [silenceRanges, setSilenceRanges] = useState<SilenceReviewRange[]>([]);
  const [silenceSourceKind, setSilenceSourceKind] = useState<SilenceSourceKind | null>(null);
  const [silenceState, setSilenceState] = useState<"idle" | "analyzing" | "ready" | "error">("idle");
  const [silenceError, setSilenceError] = useState<string | null>(null);
  const [silenceThresholdDb, setSilenceThresholdDb] = useState(-40);
  const [silenceMinDuration, setSilenceMinDuration] = useState(0.35);
  const [sceneSuggestions, setSceneSuggestions] = useState<SceneSuggestion[]>([]);
  const [sceneState, setSceneState] = useState<"idle" | "analyzing" | "ready" | "error">("idle");
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [sceneThreshold, setSceneThreshold] = useState(0.35);
  const [sceneBackup, setSceneBackup] = useState<TimelineState | null>(null);
  const [smartReframeState, setSmartReframeState] = useState<"idle" | "ready" | "error">("idle");
  const [smartReframeAnchor, setSmartReframeAnchor] = useState<ReframeAnchor | null>(null);
  const [smartReframeError, setSmartReframeError] = useState<string | null>(null);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const mediaObjectUrls = useRef<string[]>([]);
  const pendingSeekRef = useRef<{ assetId: string; sourceTime: number } | null>(null);
  const isExportingRef = useRef(false);
  const [exportState, setExportState] = useState<"idle" | "rendering" | "done" | "error">("idle");
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [serverRender, setServerRender] = useState<ServerRenderState>({
    jobId: null,
    status: "idle",
    progress: 0,
    stage: "Ready",
  });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [snapshots, setSnapshots] = useState<PhaseTwoSnapshotSummary[]>([]);
  const [storageHydrated, setStorageHydrated] = useState(false);
  const autosaveTimerRef = useRef<number | null>(null);
  const lastAutoSnapshotAtRef = useRef(0);
  const undoStack = useRef<CreatorProject[]>([]);
  const redoStack = useRef<CreatorProject[]>([]);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.volume = project.volume;
    videoRef.current.muted = project.muted;
  }, [project.volume, project.muted, media]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioTrack) return;

    const relativeTime = timeline.playhead - audioTrack.startTime;
    const active = relativeTime >= 0 && relativeTime <= audioTrack.duration;
    if (!active) {
      audio.pause();
      return;
    }

    if (!audio.seeking && Math.abs(audio.currentTime - relativeTime) > 0.18) {
      audio.currentTime = Math.max(0, Math.min(audioTrack.duration, relativeTime));
    }

    const fadeInGain = audioTrack.fadeIn > 0 ? Math.min(1, relativeTime / audioTrack.fadeIn) : 1;
    const timeLeft = Math.max(0, audioTrack.duration - relativeTime);
    const fadeOutGain = audioTrack.fadeOut > 0 ? Math.min(1, timeLeft / audioTrack.fadeOut) : 1;
    audio.volume = Math.max(0, Math.min(1, audioTrack.gain * Math.min(fadeInGain, fadeOutGain)));

    if (videoRef.current && !videoRef.current.paused && audio.paused) {
      void audio.play().catch(() => undefined);
    }
  }, [timeline.playhead, audioTrack]);

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

    setTimeline((current) => {
      const currentClips = current.tracks[0]?.clips ?? [];
      if (currentClips.length > 0) {
        const currentAssetIds = new Set(currentClips.map((clip) => clip.assetId));
        const nextAssetIds = new Set(mediaItems.map((item) => item.id));
        const sameAssets =
          currentAssetIds.size === nextAssetIds.size &&
          Array.from(currentAssetIds).every((id) => nextAssetIds.has(id));

        if (sameAssets) {
          if (
            singleSource &&
            mediaItems[0]?.kind === "video" &&
            currentClips.length === 1
          ) {
            const clip = currentClips[0];
            const end = project.trimEnd ?? mediaItems[0].duration;
            return trimTimelineClip(
              current,
              clip.id,
              project.trimStart,
              Math.max(0.1, end - project.trimStart)
            );
          }

          return current;
        }
      }

      return buildSequentialTimeline(inputs, current.playhead);
    });
  }, [mediaItems, project.trimStart, project.trimEnd]);

  const selected = useMemo(
    () => project.overlays.find((overlay) => overlay.id === selectedId) ?? null,
    [project.overlays, selectedId]
  );

  const selectedClip = useMemo(
    () => timeline.tracks[0]?.clips.find((clip) => clip.id === selectedClipId) ?? null,
    [timeline, selectedClipId]
  );

  const selectedNextClip = useMemo(
    () => (selectedClip ? getNextTimelineClip(timeline, selectedClip.id) : null),
    [timeline, selectedClip]
  );

  const selectedCaption = useMemo(
    () => captions?.cues.find((cue) => cue.id === selectedCaptionId) ?? null,
    [captions, selectedCaptionId]
  );

  const activeCaption = useMemo(
    () => captionCueAtTime(captions, timeline.playhead),
    [captions, timeline.playhead]
  );

  const transitionVisual = useMemo(
    () => getTransitionVisualState(timeline, timeline.playhead),
    [timeline]
  );

  const transitionSecondaryMedia = useMemo(
    () =>
      transitionVisual.secondaryClip
        ? mediaItems.find((item) => item.id === transitionVisual.secondaryClip?.assetId) ?? null
        : null,
    [mediaItems, transitionVisual.secondaryClip]
  );

  const activeMediaClip = useMemo(() => {
    if (!media) return null;
    if (selectedClip?.assetId === media.id) return selectedClip;
    if (transitionVisual.primaryClip?.assetId === media.id) {
      return transitionVisual.primaryClip;
    }
    return (
      timeline.tracks[0]?.clips.find((clip) => clip.assetId === media.id) ?? null
    );
  }, [media, selectedClip, timeline, transitionVisual.primaryClip]);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate =
      activeMediaClip?.kind === "video" ? activeMediaClip.transform.speed : 1;
  }, [activeMediaClip]);

  function clipMediaStyle(
    clip: TimelineClip | null,
    opacity = 1
  ): CSSProperties {
    const transform = clip?.transform;
    return {
      opacity,
      objectFit: transform?.fit === "fill" ? "fill" : transform?.fit ?? "cover",
      objectPosition: `${transform?.cropX ?? 50}% ${transform?.cropY ?? 50}%`,
      transform: `rotate(${transform?.rotation ?? 0}deg) scale(${transform?.zoom ?? 1})`,
      transformOrigin: "center",
    };
  }

  useEffect(() => {
    const clips = timeline.tracks[0]?.clips ?? [];
    if (selectedClipId && clips.some((clip) => clip.id === selectedClipId)) return;
    setSelectedClipId(clips[0]?.id ?? null);
  }, [timeline, selectedClipId]);

  function getOverlayStart(overlay: Overlay) {
    return Math.max(0, overlay.startTime ?? 0);
  }

  function getOverlayEnd(overlay: Overlay) {
    const fallback = timeline.duration > 0 ? timeline.duration : Number.POSITIVE_INFINITY;
    const value = overlay.endTime ?? fallback;
    return Math.max(getOverlayStart(overlay), value);
  }

  function isOverlayActive(overlay: Overlay, time: number) {
    return time >= getOverlayStart(overlay) && time <= getOverlayEnd(overlay);
  }

  function defaultOverlayTiming() {
    if (timeline.duration <= 0) {
      return { startTime: 0, endTime: null as number | null };
    }

    const startTime = Math.max(0, Math.min(timeline.playhead, timeline.duration));
    const remaining = Math.max(0.1, timeline.duration - startTime);
    const endTime = Math.min(timeline.duration, startTime + Math.min(3, remaining));
    return { startTime, endTime };
  }

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
      let settled = false;
      const finish = (value: number) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(fallback);
        resolve(value);
      };
      const fallback = window.setTimeout(() => finish(5), 800);
      probe.preload = "metadata";
      probe.src = url;
      probe.onloadedmetadata = () => {
        const value =
          Number.isFinite(probe.duration) && probe.duration > 0
            ? probe.duration
            : 5;
        finish(value);
      };
      probe.onerror = () => finish(5);
      probe.load();
    });
  }

  async function onAudioUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("audio/")) return;

    const url = createObjectUrl(file);
    const audioDuration = await probeAudioDuration(url);
    const maxStart = Math.max(0, timeline.duration - 0.1);
    const startTime = Math.max(0, Math.min(timeline.playhead, maxStart));

    setAudioTrack({
      id: crypto.randomUUID(),
      url,
      name: file.name,
      type: file.type,
      blob: file,
      duration: Math.min(audioDuration, Math.max(0.1, timeline.duration || audioDuration)),
      startTime,
      gain: 0.8,
      fadeIn: 0,
      fadeOut: 0,
    });
    event.target.value = "";
  }

  function probeAudioDuration(url: string) {
    return new Promise<number>((resolve) => {
      const probe = document.createElement("audio");
      let settled = false;
      const finish = (value: number) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(fallback);
        resolve(value);
      };
      const fallback = window.setTimeout(() => finish(5), 800);
      probe.preload = "metadata";
      probe.src = url;
      probe.onloadedmetadata = () => {
        const value = Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 5;
        finish(value);
      };
      probe.onerror = () => finish(5);
      probe.load();
    });
  }

  function updateAudioTrack(patch: Partial<AudioTrackItem>) {
    setAudioTrack((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      const maxStart = Math.max(0, timeline.duration - 0.1);
      next.startTime = Math.max(0, Math.min(next.startTime, maxStart));
      next.duration = Math.max(
        0.1,
        Math.min(next.duration, Math.max(0.1, timeline.duration - next.startTime))
      );
      next.gain = Math.max(0, Math.min(1, next.gain));
      next.fadeIn = Math.max(0, Math.min(next.fadeIn, next.duration));
      next.fadeOut = Math.max(0, Math.min(next.fadeOut, next.duration));
      return next;
    });
  }

  function updateCaptionCue(id: string, patch: Partial<CaptionCue>) {
    setCaptions((current) => {
      if (!current) return current;
      return {
        ...current,
        cues: current.cues.map((cue) => {
          if (cue.id !== id) return cue;
          const next = { ...cue, ...patch };
          next.startTime = Math.max(0, Math.min(next.startTime, timeline.duration));
          next.endTime = Math.max(
            next.startTime + 0.05,
            Math.min(next.endTime, timeline.duration || next.endTime)
          );
          return next;
        }),
      };
    });
  }

  function selectCaptionCue(cue: CaptionCue) {
    setSelectedCaptionId(cue.id);
    setTimeline((current) => setTimelinePlayhead(current, cue.startTime));
  }

  function cutSelectedCaptionFromMedia() {
    if (!selectedCaption || !captions) return;

    const cutStart = Math.max(0, selectedCaption.startTime);
    const cutEnd = Math.min(timeline.duration, selectedCaption.endTime);
    const cutDuration = Math.max(0, cutEnd - cutStart);
    if (cutDuration < 0.05) return;

    const nextTimeline = removeTimelineRange(
      timeline,
      cutStart,
      cutEnd,
      `clip-${crypto.randomUUID()}`
    );
    setTimeline(nextTimeline);

    setCaptions((current) => {
      if (!current) return current;
      const cues = current.cues
        .map((cue) => {
          if (cue.endTime <= cutStart) return cue;
          if (cue.startTime >= cutEnd) {
            return {
              ...cue,
              startTime: Math.max(0, cue.startTime - cutDuration),
              endTime: Math.max(0.05, cue.endTime - cutDuration),
            };
          }
          return null;
        })
        .filter((cue): cue is CaptionCue => Boolean(cue));

      return normalizeCaptionTrack({ ...current, cues });
    });

    setSelectedCaptionId(null);

    const nextClip =
      resolveTimelineTime(
        nextTimeline,
        Math.min(cutStart, Math.max(0, nextTimeline.duration - 0.001))
      )?.clip ??
      nextTimeline.tracks[0]?.clips[0] ??
      null;

    setSelectedClipId(nextClip?.id ?? null);
    if (!nextClip) {
      setMedia(null);
      setDuration(0);
      return;
    }

    const nextMedia =
      mediaItems.find((item) => item.id === nextClip.assetId) ?? null;
    setMedia(nextMedia);
    setDuration(nextMedia?.kind === "video" ? nextMedia.duration : 0);
  }

  function mapTranscriptToTimeline(track: CaptionTrack): CaptionTrack {
    const clip =
      selectedClip?.kind === "video"
        ? selectedClip
        : timeline.tracks[0]?.clips.find((item) => item.kind === "video") ?? null;
    const videoItem = clip
      ? mediaItems.find((item) => item.id === clip.assetId && item.kind === "video") ?? null
      : null;

    if (clip && videoItem) {
      const speed = Math.max(0.01, clip.transform.speed);
      const sourceStart = clip.sourceStart;
      const sourceEnd = sourceStart + clip.duration * speed;
      const cues = track.cues
        .map((cue) => {
          const start = Math.max(sourceStart, cue.startTime);
          const end = Math.min(sourceEnd, cue.endTime);
          if (end <= start) return null;
          return {
            ...cue,
            startTime: clip.timelineStart + (start - sourceStart) / speed,
            endTime: clip.timelineStart + (end - sourceStart) / speed,
          };
        })
        .filter((cue): cue is CaptionCue => Boolean(cue));
      return normalizeCaptionTrack({ ...track, cues });
    }

    if (audioTrack) {
      const cues = track.cues
        .map((cue) => {
          const start = Math.max(0, cue.startTime);
          const end = Math.min(audioTrack.duration, cue.endTime);
          if (end <= start) return null;
          return {
            ...cue,
            startTime: audioTrack.startTime + start,
            endTime: audioTrack.startTime + end,
          };
        })
        .filter((cue): cue is CaptionCue => Boolean(cue));
      return normalizeCaptionTrack({ ...track, cues });
    }

    return normalizeCaptionTrack(track);
  }

  async function generateCaptions() {
    const clip =
      selectedClip?.kind === "video"
        ? selectedClip
        : timeline.tracks[0]?.clips.find((item) => item.kind === "video") ?? null;
    const videoSource = clip
      ? mediaItems.find((item) => item.id === clip.assetId && item.kind === "video") ?? null
      : null;
    const source = videoSource ?? audioTrack;

    if (!source) {
      setCaptionState("error");
      setCaptionError("Add a video or music/audio track before generating captions.");
      return;
    }

    setCaptionState("generating");
    setCaptionError(null);

    try {
      const form = new FormData();
      form.append("media", source.blob, source.name);
      form.append("language", captionLanguage);
      form.append("duration", String(source.duration));

      const response = await fetch("/api/captions/transcribe", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as CaptionTrack & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Caption transcription failed.");
      }

      const mapped = mapTranscriptToTimeline(payload);
      setCaptions(mapped);
      setCaptionLanguage(mapped.requestedLanguage ?? captionLanguage);
      setSelectedCaptionId(mapped.cues[0]?.id ?? null);
      setCaptionState("ready");
    } catch (error) {
      setCaptionState("error");
      setCaptionError(
        error instanceof Error ? error.message : "Unable to generate captions."
      );
    }
  }

  async function detectSilence() {
    const clip =
      selectedClip?.kind === "video"
        ? selectedClip
        : timeline.tracks[0]?.clips.find((item) => item.kind === "video") ?? null;
    const videoSource = clip
      ? mediaItems.find((item) => item.id === clip.assetId && item.kind === "video") ?? null
      : null;
    const source = videoSource ?? audioTrack;

    if (!source) {
      setSilenceState("error");
      setSilenceError("Add or select a video/audio source before detecting silence.");
      return;
    }

    setSilenceState("analyzing");
    setSilenceError(null);

    try {
      const form = new FormData();
      form.append("media", source.blob, source.name);
      form.append("thresholdDb", String(silenceThresholdDb));
      form.append("minDuration", String(silenceMinDuration));

      const response = await fetch("/api/analyze/silence", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as {
        ranges?: Array<{ startTime: number; endTime: number; duration: number }>;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Silence analysis failed.");
      }

      const sourceRanges = payload.ranges ?? [];
      const mapped: SilenceReviewRange[] = [];

      if (clip && videoSource) {
        const speed = Math.max(0.01, clip.transform.speed);
        const sourceStart = clip.sourceStart;
        const sourceEnd = sourceStart + clip.duration * speed;

        sourceRanges.forEach((range, index) => {
          const start = Math.max(sourceStart, range.startTime);
          const end = Math.min(sourceEnd, range.endTime);
          if (end <= start) return;
          const startTime =
            clip.timelineStart + (start - sourceStart) / speed;
          const endTime =
            clip.timelineStart + (end - sourceStart) / speed;
          mapped.push({
            id: `silence-${index}-${crypto.randomUUID()}`,
            startTime,
            endTime,
            duration: endTime - startTime,
            selected: true,
          });
        });
        setSilenceSourceKind("video");
      } else if (audioTrack) {
        sourceRanges.forEach((range, index) => {
          const start = Math.max(0, range.startTime);
          const end = Math.min(audioTrack.duration, range.endTime);
          if (end <= start) return;
          mapped.push({
            id: `silence-${index}-${crypto.randomUUID()}`,
            startTime: audioTrack.startTime + start,
            endTime: audioTrack.startTime + end,
            duration: end - start,
            selected: true,
          });
        });
        setSilenceSourceKind("audio");
      }

      setSilenceRanges(mapped);
      setSilenceState("ready");
    } catch (error) {
      setSilenceRanges([]);
      setSilenceState("error");
      setSilenceError(
        error instanceof Error ? error.message : "Unable to detect silence."
      );
    }
  }

  function applySelectedSilenceCuts() {
    if (silenceSourceKind !== "video") {
      setSilenceError(
        "Automatic removal currently applies to selected video clips. Audio-only ranges are review-only."
      );
      return;
    }

    const selectedRanges = silenceRanges
      .filter((range) => range.selected)
      .sort((a, b) => b.startTime - a.startTime);

    if (selectedRanges.length === 0) return;

    let nextTimeline = timeline;
    let nextCaptions = captions;

    for (const range of selectedRanges) {
      nextTimeline = removeTimelineRange(
        nextTimeline,
        range.startTime,
        range.endTime,
        `clip-${crypto.randomUUID()}`
      );
      nextCaptions = cutCaptionTrackRange(
        nextCaptions,
        range.startTime,
        range.endTime
      );
    }

    setTimeline(nextTimeline);
    setCaptions(nextCaptions);
    setSilenceRanges([]);
    setSilenceState("idle");
    setSilenceError(null);

    const nextClip =
      resolveTimelineTime(
        nextTimeline,
        Math.min(
          selectedRanges[selectedRanges.length - 1]?.startTime ?? 0,
          Math.max(0, nextTimeline.duration - 0.001)
        )
      )?.clip ??
      nextTimeline.tracks[0]?.clips[0] ??
      null;

    setSelectedClipId(nextClip?.id ?? null);
    if (!nextClip) {
      setMedia(null);
      setDuration(0);
      return;
    }

    const nextMedia =
      mediaItems.find((item) => item.id === nextClip.assetId) ?? null;
    setMedia(nextMedia);
    setDuration(nextMedia?.kind === "video" ? nextMedia.duration : 0);
  }

  async function detectScenes() {
    const clip =
      selectedClip?.kind === "video"
        ? selectedClip
        : timeline.tracks[0]?.clips.find((item) => item.kind === "video") ?? null;
    const videoSource = clip
      ? mediaItems.find((item) => item.id === clip.assetId && item.kind === "video") ?? null
      : null;

    if (!clip || !videoSource) {
      setSceneState("error");
      setSceneError("Select a video clip before detecting scene changes.");
      return;
    }

    setSceneState("analyzing");
    setSceneError(null);

    try {
      const form = new FormData();
      form.append("media", videoSource.blob, videoSource.name);
      form.append("threshold", String(sceneThreshold));

      const response = await fetch("/api/analyze/scenes", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as {
        boundaries?: number[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Scene analysis failed.");
      }

      const speed = Math.max(0.01, clip.transform.speed);
      const sourceStart = clip.sourceStart;
      const sourceEnd = sourceStart + clip.duration * speed;
      const suggestions = (payload.boundaries ?? [])
        .filter((time) => time > sourceStart + 0.05 && time < sourceEnd - 0.05)
        .map((time, index) => ({
          id: `scene-${index}-${crypto.randomUUID()}`,
          time: clip.timelineStart + (time - sourceStart) / speed,
          selected: true,
        }));

      setSceneSuggestions(suggestions);
      setSceneState("ready");
    } catch (error) {
      setSceneSuggestions([]);
      setSceneState("error");
      setSceneError(
        error instanceof Error ? error.message : "Unable to detect scenes."
      );
    }
  }

  function applySceneSplits() {
    const selected = sceneSuggestions
      .filter((scene) => scene.selected)
      .sort((a, b) => a.time - b.time);
    if (selected.length === 0) return;

    setSceneBackup(timeline);
    let nextTimeline = timeline;

    for (const scene of selected) {
      const resolved = resolveTimelineTime(nextTimeline, scene.time);
      if (!resolved) continue;
      const offset = scene.time - resolved.clip.timelineStart;
      nextTimeline = splitTimelineClip(
        nextTimeline,
        resolved.clip.id,
        offset,
        `clip-${crypto.randomUUID()}`
      );
    }

    setTimeline(nextTimeline);
    setSceneSuggestions([]);
    setSceneState("idle");
    setSceneError(null);
  }

  function undoSceneSplits() {
    if (!sceneBackup) return;
    setTimeline(sceneBackup);
    setSceneBackup(null);
    setSceneSuggestions([]);
    setSceneState("idle");

    const clip =
      resolveTimelineTime(sceneBackup, sceneBackup.playhead)?.clip ??
      sceneBackup.tracks[0]?.clips[0] ??
      null;
    setSelectedClipId(clip?.id ?? null);

    if (clip) {
      const item = mediaItems.find((candidate) => candidate.id === clip.assetId) ?? null;
      setMedia(item);
      setDuration(item?.kind === "video" ? item.duration : 0);
    }
  }

  function applySmartReframe(targetRatio?: RatioKey) {
    if (!selectedClip) {
      setSmartReframeState("error");
      setSmartReframeError("Select a visual clip before smart reframe.");
      return;
    }

    const selectedMedia =
      mediaItems.find((item) => item.id === selectedClip.assetId) ?? null;
    if (!selectedMedia || media?.id !== selectedMedia.id) {
      setSmartReframeState("error");
      setSmartReframeError("Open the selected clip in the preview before smart reframe.");
      return;
    }

    const source =
      selectedMedia.kind === "video"
        ? videoRef.current
        : (document.getElementById("creative-image") as HTMLImageElement | null);

    if (!source) {
      setSmartReframeState("error");
      setSmartReframeError("The current frame is not ready for analysis.");
      return;
    }

    try {
      const anchor = detectSaliencyAnchor(source);
      const nextTimeline = updateTimelineClipTransform(timeline, selectedClip.id, {
        fit: "cover",
        cropX: anchor.x,
        cropY: anchor.y,
      });
      const nextProject = targetRatio
        ? { ...project, ratio: targetRatio }
        : project;

      setTimeline(nextTimeline);
      if (targetRatio) {
        replaceProject(() => nextProject);
      }
      setSmartReframeAnchor(anchor);
      setSmartReframeState("ready");
      setSmartReframeError(null);

      // Persist the atomic reframe result immediately so a reload cannot race
      // the regular debounced autosave between ratio and crop updates.
      void (async () => {
        try {
          setSaveState("saving");
          const savedAt = await savePhaseTwoDraft({
            ...buildPhaseTwoSaveInput(),
            project: nextProject,
            timeline: nextTimeline,
          });
          setLastSavedAt(savedAt);
          setSaveState("saved");
        } catch {
          setSaveState("error");
        }
      })();
    } catch (error) {
      setSmartReframeState("error");
      setSmartReframeError(
        error instanceof Error ? error.message : "Unable to analyze this frame."
      );
    }
  }

  function selectMediaItem(item: MediaItem) {
    setMedia(item);
    setDuration(item.kind === "video" ? item.duration : 0);
    const clip = timeline.tracks[0]?.clips.find((entry) => entry.assetId === item.id);
    if (clip) {
      setSelectedClipId(clip.id);
      setTimeline((current) => setTimelinePlayhead(current, clip.timelineStart));
      if (item.kind === "video") {
        pendingSeekRef.current = { assetId: item.id, sourceTime: clip.sourceStart };
      }
    }
  }

  function selectTimelineClip(clip: TimelineClip) {
    setSelectedClipId(clip.id);
    const item = mediaItems.find((candidate) => candidate.id === clip.assetId);
    if (!item) return;

    setMedia(item);
    setDuration(item.kind === "video" ? item.duration : 0);
    if (item.kind === "video") {
      pendingSeekRef.current = { assetId: item.id, sourceTime: clip.sourceStart };
      if (media?.id === item.id && videoRef.current) {
        videoRef.current.currentTime = clip.sourceStart;
        pendingSeekRef.current = null;
      }
    }
  }

  function updateSelectedClipTrim(field: "sourceStart" | "duration", value: number) {
    if (!selectedClip) return;
    const sourceStart = field === "sourceStart" ? value : selectedClip.sourceStart;
    const clipDuration = field === "duration" ? value : selectedClip.duration;
    setTimeline((current) =>
      trimTimelineClip(current, selectedClip.id, sourceStart, clipDuration)
    );

    if (field === "sourceStart" && media?.id === selectedClip.assetId && videoRef.current) {
      videoRef.current.currentTime = Math.max(0, value);
    }
  }

  function splitSelectedClip() {
    if (!selectedClip) return;
    const offset = timeline.playhead - selectedClip.timelineStart;
    const rightId = `${selectedClip.id}-split-${crypto.randomUUID()}`;
    const beforeCount = timeline.tracks[0]?.clips.length ?? 0;
    const next = splitTimelineClip(timeline, selectedClip.id, offset, rightId);
    const afterCount = next.tracks[0]?.clips.length ?? 0;
    if (afterCount === beforeCount) return;
    setTimeline(next);
    setSelectedClipId(rightId);
  }

  function duplicateSelectedClip() {
    if (!selectedClip) return;
    const copyId = `${selectedClip.id}-copy-${crypto.randomUUID()}`;
    setTimeline((current) => duplicateTimelineClip(current, selectedClip.id, copyId));
    setSelectedClipId(copyId);
  }

  function deleteSelectedClip() {
    if (!selectedClip) return;
    setTimeline((current) => deleteTimelineClip(current, selectedClip.id));
    setSelectedClipId(null);
  }

  function moveSelectedClip(direction: -1 | 1) {
    if (!selectedClip) return;
    setTimeline((current) => moveTimelineClip(current, selectedClip.id, direction));
  }

  function updateSelectedTransitionType(type: TransitionType) {
    if (!selectedClip) return;
    const duration =
      selectedClip.transitionOut?.duration ??
      Math.min(0.6, getMaxTransitionDuration(selectedClip, selectedNextClip));
    setTimeline((current) =>
      setTimelineClipTransition(current, selectedClip.id, type, duration || 0.1)
    );
  }

  function updateSelectedTransitionDuration(duration: number) {
    if (!selectedClip?.transitionOut) return;
    setTimeline((current) =>
      setTimelineClipTransition(
        current,
        selectedClip.id,
        selectedClip.transitionOut?.type ?? "none",
        duration
      )
    );
  }

  function updateSelectedClipTransform(
    patch: Partial<TimelineClip["transform"]>
  ) {
    if (!selectedClip) return;
    setTimeline((current) =>
      updateTimelineClipTransform(current, selectedClip.id, patch)
    );
  }

  function moveMediaItem(id: string, direction: -1 | 1) {
    let moved = false;
    setMediaItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      moved = true;
      return next;
    });

    if (moved) {
      setTimeline((current) => {
        const clips = current.tracks[0]?.clips.filter(
          (clip) => clip.assetId === id
        ) ?? [];
        if (clips.length !== 1) return current;
        return moveTimelineClip(current, clips[0].id, direction);
      });
    }
  }

  function addText() {
    const id = crypto.randomUUID();
    const timing = defaultOverlayTiming();
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
      ...timing,
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
      const timing = defaultOverlayTiming();
      const overlay: Overlay = {
        id,
        kind: "image",
        src: String(reader.result),
        x: 80,
        y: 10,
        width: 18,
        opacity: 1,
        ...timing,
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

  function clampTimelineTime(value: number) {
    return Math.max(0, Math.min(timeline.duration, value));
  }

  function snapTimelineTime(value: number) {
    const clamped = clampTimelineTime(value);
    if (!snapEnabled || timeline.duration <= 0) return clamped;

    const snapPoints = [
      0,
      timeline.duration,
      ...(timeline.tracks[0]?.clips.flatMap((clip) => [
        clip.timelineStart,
        clip.timelineStart + clip.duration,
      ]) ?? []),
      ...project.overlays.flatMap((overlay) => {
        const end = getOverlayEnd(overlay);
        return Number.isFinite(end)
          ? [getOverlayStart(overlay), Math.min(end, timeline.duration)]
          : [getOverlayStart(overlay)];
      }),
      ...(audioTrack
        ? [
            audioTrack.startTime,
            Math.min(timeline.duration, audioTrack.startTime + audioTrack.duration),
          ]
        : []),
    ];

    const nearest = snapPoints.reduce(
      (best, point) =>
        Math.abs(point - clamped) < Math.abs(best - clamped) ? point : best,
      snapPoints[0] ?? clamped
    );
    const threshold = Math.max(0.04, 0.18 / Math.max(1, timelineZoom));
    if (Math.abs(nearest - clamped) <= threshold) {
      return clampTimelineTime(nearest);
    }

    return clampTimelineTime(Math.round(clamped * 10) / 10);
  }

  function seekTimelineTo(rawTime: number, applySnap = true) {
    if (timeline.duration <= 0) return;
    const timelineTime = applySnap
      ? snapTimelineTime(rawTime)
      : clampTimelineTime(rawTime);
    const resolved = resolveTimelineTime(timeline, timelineTime);
    setTimeline((current) => setTimelinePlayhead(current, timelineTime));

    if (!resolved) return;
    setSelectedClipId(resolved.clip.id);
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

  function scrubTimeline(event: ReactMouseEvent<HTMLDivElement>) {
    if (timeline.duration <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    seekTimelineTo(timeline.duration * ratio);
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isEditing =
        target?.isContentEditable ||
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select";
      if (isEditing) return;

      if (event.code === "Space") {
        event.preventDefault();
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
          void video.play().catch(() => undefined);
        } else {
          video.pause();
        }
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const step = event.shiftKey ? 1 : 0.1;
        seekTimelineTo(timeline.playhead + direction * step, false);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        seekTimelineTo(0, false);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        seekTimelineTo(timeline.duration, false);
        return;
      }

      if (!event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        setSnapEnabled((value) => !value);
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setTimelineZoom((value) => Math.min(4, Math.round((value + 0.25) * 100) / 100));
        return;
      }

      if (event.key === "-") {
        event.preventDefault();
        setTimelineZoom((value) => Math.max(1, Math.round((value - 0.25) * 100) / 100));
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedId) {
          event.preventDefault();
          deleteSelected();
          return;
        }
        const clipCount = timeline.tracks[0]?.clips.length ?? 0;
        if (selectedClipId && clipCount > 1) {
          event.preventDefault();
          deleteSelectedClip();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    timeline,
    selectedId,
    selectedClipId,
    media,
    mediaItems,
    snapEnabled,
    timelineZoom,
    project.overlays,
    audioTrack,
  ]);

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

  function buildPhaseTwoSaveInput(): PhaseTwoSaveInput {
    return {
      project,
      mediaItems: mediaItems.map(({ url: _url, ...item }) => item),
      timeline,
      audioTrack: audioTrack
        ? (({ url: _url, ...track }) => track)(audioTrack)
        : null,
      captions,
      captionStyle,
      timelineZoom,
      snapEnabled,
      selectedClipId,
      selectedOverlayId: selectedId,
    };
  }

  async function refreshSnapshots() {
    const nextSnapshots = await listPhaseTwoSnapshots();
    setSnapshots(nextSnapshots);
  }

  function restorePhaseTwoState(state: HydratedPhaseTwoState) {
    const restoredMediaItems: MediaItem[] = state.mediaItems.map((item) => ({
      ...item,
      url: createObjectUrl(item.blob),
    }));
    const restoredAudio: AudioTrackItem | null = state.audioTrack
      ? {
          ...state.audioTrack,
          url: createObjectUrl(state.audioTrack.blob),
        }
      : null;

    setProject({ ...initialProject, ...state.project });
    setMediaItems(restoredMediaItems);
    setTimeline(state.timeline);
    setAudioTrack(restoredAudio);
    setCaptions(state.captions ?? null);
    setCaptionStyle(normalizeCaptionStyle(state.captionStyle));
    setCaptionLanguage(state.captions?.requestedLanguage ?? "auto");
    setCaptionState(state.captions?.cues.length ? "ready" : "idle");
    setSelectedCaptionId(state.captions?.cues[0]?.id ?? null);
    setTimelineZoom(state.timelineZoom ?? 1);
    setSnapEnabled(state.snapEnabled ?? true);

    const clips = state.timeline.tracks[0]?.clips ?? [];
    const selectedClip =
      clips.find((clip) => clip.id === state.selectedClipId) ?? clips[0] ?? null;
    const selectedMedia = selectedClip
      ? restoredMediaItems.find((item) => item.id === selectedClip.assetId) ?? null
      : restoredMediaItems[0] ?? null;

    setSelectedClipId(selectedClip?.id ?? null);
    setSelectedId(state.selectedOverlayId ?? null);
    setMedia(selectedMedia);
    setDuration(selectedMedia?.kind === "video" ? selectedMedia.duration : 0);
    setLastSavedAt(state.savedAt);
    setSaveState("saved");
    undoStack.current = [];
    redoStack.current = [];
  }

  async function saveDraft() {
    try {
      setSaveState("saving");
      const input = buildPhaseTwoSaveInput();
      const savedAt = await savePhaseTwoDraft(input);
      await savePhaseTwoSnapshot(input, "manual");
      lastAutoSnapshotAtRef.current = savedAt;
      setLastSavedAt(savedAt);
      setSaveState("saved");
      await refreshSnapshots();
      alert("Project saved locally and a version snapshot was created.");
    } catch (error) {
      setSaveState("error");
      const message = error instanceof Error ? error.message : "Unable to save the local draft.";
      alert(message);
    }
  }

  async function loadDraft() {
    try {
      const phaseTwoDraft = await loadPhaseTwoDraft();
      if (phaseTwoDraft) {
        restorePhaseTwoState(phaseTwoDraft);
        await refreshSnapshots();
        alert("Latest autosaved project restored.");
        return;
      }

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
        alert("Legacy Phase 1 draft restored. It will migrate on the next autosave.");
        return;
      }

      const legacy = localStorage.getItem("nemdar-creative-studio-phase1");
      if (!legacy) return alert("No local draft found.");
      const parsed = JSON.parse(legacy) as CreatorProject;
      replaceProject(() => ({ ...initialProject, ...parsed }));
      setSelectedId(null);
      alert("Legacy project settings restored. They will migrate on the next autosave.");
    } catch (error) {
      setSaveState("error");
      const message = error instanceof Error ? error.message : "Unable to load the local draft.";
      alert(message);
    }
  }

  async function restoreSnapshot(snapshotId: string) {
    try {
      setSaveState("saving");
      const snapshot = await loadPhaseTwoSnapshot(snapshotId);
      if (!snapshot) throw new Error("Snapshot not found.");
      restorePhaseTwoState(snapshot);
      await savePhaseTwoDraft(buildPhaseTwoSaveInputFromHydrated(snapshot));
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      alert(error instanceof Error ? error.message : "Unable to restore snapshot.");
    }
  }

  function buildPhaseTwoSaveInputFromHydrated(
    state: HydratedPhaseTwoState
  ): PhaseTwoSaveInput {
    return {
      project: state.project,
      mediaItems: state.mediaItems,
      timeline: state.timeline,
      audioTrack: state.audioTrack,
      captions: state.captions ?? null,
      captionStyle: normalizeCaptionStyle(state.captionStyle),
      timelineZoom: state.timelineZoom,
      snapEnabled: state.snapEnabled,
      selectedClipId: state.selectedClipId,
      selectedOverlayId: state.selectedOverlayId,
    };
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [draft, storedSnapshots] = await Promise.all([
          loadPhaseTwoDraft(),
          listPhaseTwoSnapshots(),
        ]);
        if (cancelled) return;

        setSnapshots(storedSnapshots);
        if (draft) {
          restorePhaseTwoState(draft);
          lastAutoSnapshotAtRef.current = draft.savedAt;
        }
      } catch {
        if (!cancelled) setSaveState("error");
      } finally {
        if (!cancelled) setStorageHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!storageHydrated) return;

    const hasMeaningfulState =
      mediaItems.length > 0 ||
      project.overlays.length > 0 ||
      audioTrack !== null ||
      captions !== null;
    if (!hasMeaningfulState) return;

    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          setSaveState("saving");
          const input = buildPhaseTwoSaveInput();
          const savedAt = await savePhaseTwoDraft(input);
          setLastSavedAt(savedAt);
          setSaveState("saved");

          const shouldSnapshot =
            savedAt - lastAutoSnapshotAtRef.current >= 30_000;
          if (shouldSnapshot) {
            await savePhaseTwoSnapshot(input, "auto");
            lastAutoSnapshotAtRef.current = savedAt;
            await refreshSnapshots();
          }
        } catch {
          setSaveState("error");
        }
      })();
    }, 900);

    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [
    storageHydrated,
    project,
    mediaItems,
    timeline.tracks,
    audioTrack,
    captions,
    captionStyle,
    timelineZoom,
    snapEnabled,
  ]);

  async function buildServerRenderForm() {
    if (timeline.duration <= 0 || mediaItems.length === 0) {
      throw new Error("Add at least one visual clip before rendering.");
    }

    const { width, height } = renderDimensions(project.ratio);
    const form = new FormData();

    const mediaManifest = mediaItems.map((item) => {
      const field = `media:${item.id}`;
      form.append(field, item.blob, item.name);
      return {
        id: item.id,
        field,
        kind: item.kind,
        name: item.name,
      };
    });

    const overlayManifest: ServerRenderManifest["overlays"] = [];
    for (const overlay of project.overlays) {
      const rendered = await rasterizeOverlayAsset(overlay, width, height);
      const field = `overlay:${overlay.id}`;
      form.append(field, rendered.blob, `${overlay.id}.png`);
      const startTime = Math.max(0, Math.min(getOverlayStart(overlay), timeline.duration));
      const endTime = Math.max(
        startTime,
        Math.min(getOverlayEnd(overlay), timeline.duration)
      );
      overlayManifest.push({
        id: overlay.id,
        field,
        x: Math.round((overlay.x / 100) * width - rendered.width / 2),
        y: Math.round((overlay.y / 100) * height - rendered.height / 2),
        width: rendered.width,
        height: rendered.height,
        startTime,
        endTime,
      });
    }

    let audioManifest: ServerRenderManifest["audioTrack"] = null;
    if (audioTrack) {
      const field = `audio:${audioTrack.id}`;
      form.append(field, audioTrack.blob, audioTrack.name);
      audioManifest = {
        id: audioTrack.id,
        field,
        startTime: audioTrack.startTime,
        duration: audioTrack.duration,
        gain: audioTrack.gain,
        fadeIn: audioTrack.fadeIn,
        fadeOut: audioTrack.fadeOut,
      };
    }

    const manifest: ServerRenderManifest = {
      schemaVersion: 1,
      projectName: project.name,
      output: {
        width,
        height,
        fps: 30,
      },
      duration: timeline.duration,
      timeline,
      media: mediaManifest,
      overlays: overlayManifest,
      audioTrack: audioManifest,
    };

    form.append("manifest", JSON.stringify(manifest));
    return form;
  }

  async function pollServerRender(jobId: string) {
    for (let attempt = 0; attempt < 900; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      const response = await fetch(`/api/render/jobs/${jobId}`, {
        cache: "no-store",
      });
      const job = (await response.json()) as ServerRenderState & {
        jobId: string;
      };
      if (!response.ok) {
        throw new Error(job.error || "Unable to read render job.");
      }

      setServerRender({
        jobId,
        status: job.status,
        progress: job.progress,
        stage: job.stage,
        outputUrl: job.outputUrl,
        error: job.error,
      });

      if (job.status === "failed") {
        throw new Error(job.error || "MP4 render failed.");
      }

      if (job.status === "succeeded" && job.outputUrl) {
        const link = document.createElement("a");
        link.href = job.outputUrl;
        link.download =
          `${project.name.replace(/[^a-z0-9-_]+/gi, "-") || "nemdar-creative"}.mp4`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        return;
      }
    }
    throw new Error("MP4 render timed out.");
  }

  async function queueMp4Render() {
    try {
      setServerRender({
        jobId: null,
        status: "queued",
        progress: 0,
        stage: "Preparing assets",
      });
      const form = await buildServerRenderForm();
      const response = await fetch("/api/render/jobs", {
        method: "POST",
        body: form,
      });
      const job = (await response.json()) as ServerRenderState & {
        jobId?: string;
        error?: string;
      };

      if (!response.ok || !job.jobId) {
        throw new Error(job.error || "Unable to queue MP4 render.");
      }

      setServerRender({
        jobId: job.jobId,
        status: job.status,
        progress: job.progress,
        stage: job.stage,
        outputUrl: job.outputUrl,
        error: job.error,
      });
      await pollServerRender(job.jobId);
    } catch (error) {
      setServerRender((current) => ({
        ...current,
        status: "failed",
        stage: "Failed",
        error:
          error instanceof Error ? error.message : "Unexpected MP4 render failure.",
      }));
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

    const transitionState = getTransitionVisualState(timeline, timeline.playhead);
    ctx.save();
    ctx.globalAlpha =
      transitionState.primaryClip?.assetId === media.id
        ? transitionState.primaryOpacity
        : 1;
    drawMediaFrame(ctx, source, canvas.width, canvas.height, transitionState.primaryClip ?? activeMediaClip);
    ctx.restore();

    if (
      transitionState.type === "crossfade" &&
      transitionState.secondaryClip &&
      transitionState.secondaryOpacity > 0
    ) {
      const secondaryMedia = mediaItems.find(
        (item) => item.id === transitionState.secondaryClip?.assetId
      );
      if (secondaryMedia?.kind === "image") {
        const image = new Image();
        image.src = secondaryMedia.url;
        await image.decode();
        ctx.save();
        ctx.globalAlpha = transitionState.secondaryOpacity;
        drawMediaFrame(ctx, image, canvas.width, canvas.height, transitionState.secondaryClip);
        ctx.restore();
      }
    }

    if (transitionState.blackOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = transitionState.blackOpacity;
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    for (const overlay of project.overlays.filter((item) => isOverlayActive(item, timeline.playhead))) {
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
    overlayImages: Map<string, HTMLImageElement>,
    timelineTime: number
  ) {
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, width, height);

    const transitionState = getTransitionVisualState(timeline, timelineTime);
    ctx.save();
    ctx.globalAlpha = transitionState.primaryOpacity;
    drawMediaFrame(ctx, source, width, height, transitionState.primaryClip);
    ctx.restore();

    if (transitionState.blackOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = transitionState.blackOpacity;
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    for (const overlay of project.overlays.filter((item) => isOverlayActive(item, timelineTime))) {
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
    const activeClip =
      timeline.tracks[0]?.clips.find((clip) => clip.id === selectedClipId) ??
      timeline.tracks[0]?.clips.find((clip) => clip.assetId === media.id);
    const speed = activeClip?.transform.speed ?? 1;
    const start = activeClip
      ? Math.max(0, activeClip.sourceStart)
      : Math.max(0, project.trimStart);
    const end = activeClip
      ? Math.min(
          activeClip.sourceStart + activeClip.duration * speed,
          duration
        )
      : Math.min(project.trimEnd ?? duration, duration);
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
    const originalPlaybackRate = video.playbackRate;
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

      const exportDurationMs = Math.max(1, (activeClip?.duration ?? (end - start)) * 1000);
      video.muted = true;
      video.playbackRate = speed;
      const exportTimelineStart = activeClip?.timelineStart ?? timeline.playhead;
      drawCompositionFrame(
        ctx,
        video,
        canvas.width,
        canvas.height,
        overlayImages,
        exportTimelineStart
      );
      recorder.start(250);
      void video.play().catch(() => undefined);

      await new Promise<void>((resolve, reject) => {
        const startedAt = performance.now();

        const render = () => {
          try {
            if (video.readyState >= 2) {
              const frameTimelineTime =
                (activeClip?.timelineStart ?? 0) +
                Math.max(
                  0,
                  (video.currentTime - (activeClip?.sourceStart ?? start)) /
                    Math.max(0.01, speed)
                );
              drawCompositionFrame(
                ctx,
                video,
                canvas.width,
                canvas.height,
                overlayImages,
                frameTimelineTime
              );
            }

            const elapsedMs = performance.now() - startedAt;
            const desiredTime = Math.min(end, start + (elapsedMs / 1000) * speed);
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
      video.playbackRate = originalPlaybackRate;
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

  function drawMediaFrame(
    ctx: CanvasRenderingContext2D,
    source: HTMLVideoElement | HTMLImageElement,
    w: number,
    h: number,
    clip: TimelineClip | null
  ) {
    const sw = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
    const sh = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
    const safeW = sw || w;
    const safeH = sh || h;
    const transform = clip?.transform;
    const fit = transform?.fit ?? "cover";
    const zoom = transform?.zoom ?? 1;

    let scaleX = 1;
    let scaleY = 1;
    if (fit === "fill") {
      scaleX = w / safeW;
      scaleY = h / safeH;
    } else {
      const scale =
        fit === "contain"
          ? Math.min(w / safeW, h / safeH)
          : Math.max(w / safeW, h / safeH);
      scaleX = scale;
      scaleY = scale;
    }

    const dw = safeW * scaleX * zoom;
    const dh = safeH * scaleY * zoom;
    const cropX = (transform?.cropX ?? 50) / 100;
    const cropY = (transform?.cropY ?? 50) / 100;
    const dx = (w - dw) * cropX;
    const dy = (h - dh) * cropY;
    const rotation = ((transform?.rotation ?? 0) * Math.PI) / 180;

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(rotation);
    ctx.drawImage(source, dx - w / 2, dy - h / 2, dw, dh);
    ctx.restore();
  }

  const ratio = RATIOS[project.ratio];

  return (
    <main className="appShell">
      <header className="topbar">
        <div>
          <span className="eyebrow">NEMDAR</span>
          <strong>Creative Studio</strong>
          <span className="phaseChip">P3 automatic captions</span>
        </div>
        <div className="topActions">
          <button className="ghost" onClick={undo}>Undo</button>
          <button className="ghost" onClick={redo}>Redo</button>
          <button className="ghost" onClick={loadDraft}>Load draft</button>
          <button className="ghost" onClick={saveDraft}>Save draft</button>
          <button className="ghost" onClick={exportAsset} disabled={exportState === "rendering"}>{exportState === "rendering" ? `Exporting ${exportProgress}%` : media?.kind === "video" ? "Export video" : "Export frame"}</button>
          <button
            className="primary"
            data-testid="export-mp4"
            onClick={() => void queueMp4Render()}
            disabled={
              mediaItems.length === 0 ||
              serverRender.status === "queued" ||
              serverRender.status === "running"
            }
          >
            {serverRender.status === "queued" || serverRender.status === "running"
              ? `MP4 ${serverRender.progress}%`
              : "Export MP4"}
          </button>
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
          <label className="toolButton fileButton">+ Music / audio<input type="file" accept="audio/*" onChange={onAudioUpload} hidden /></label>

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
                    const rawDuration = e.currentTarget.duration;
                    const d =
                      Number.isFinite(rawDuration) && rawDuration > 0
                        ? rawDuration
                        : Number.isFinite(media.duration) && media.duration > 0
                          ? media.duration
                          : 5;
                    setDuration(d);
                    const playbackClip =
                      timeline.tracks[0]?.clips.find((clip) => clip.id === selectedClipId) ??
                      timeline.tracks[0]?.clips.find((clip) => clip.assetId === media.id);
                    e.currentTarget.playbackRate = playbackClip?.transform.speed ?? 1;
                    setMediaItems((current) => {
                      const stored = current.find((item) => item.id === media.id);
                      if (!stored || Math.abs(stored.duration - d) < 0.01) return current;
                      return current.map((item) =>
                        item.id === media.id ? { ...item, duration: d } : item
                      );
                    });

                    const pending = pendingSeekRef.current;
                    if (pending?.assetId === media.id) {
                      e.currentTarget.currentTime = pending.sourceTime;
                      pendingSeekRef.current = null;
                    } else if (mediaItems.length <= 1) {
                      e.currentTarget.currentTime = project.trimStart;
                      replaceProject((p) => ({ ...p, trimEnd: p.trimEnd ?? d }), false);
                    } else {
                      const activeClip =
                        timeline.tracks[0]?.clips.find((clip) => clip.id === selectedClipId) ??
                        timeline.tracks[0]?.clips.find((clip) => clip.assetId === media.id);
                      e.currentTarget.currentTime = activeClip?.sourceStart ?? 0;
                    }
                  }}
                  onPlay={(e) => {
                    const singleSource = mediaItems.length <= 1;
                    const activeClip =
                      timeline.tracks[0]?.clips.find((clip) => clip.id === selectedClipId) ??
                      timeline.tracks[0]?.clips.find((clip) => clip.assetId === media.id);
                    const start = activeClip?.sourceStart ?? (singleSource ? project.trimStart : 0);
                    const end = activeClip
                      ? activeClip.sourceStart + activeClip.duration * activeClip.transform.speed
                      : (singleSource ? (project.trimEnd ?? duration) : duration);
                    e.currentTarget.playbackRate = activeClip?.transform.speed ?? 1;
                    if (e.currentTarget.currentTime < start || e.currentTarget.currentTime >= end) {
                      e.currentTarget.currentTime = start;
                    }

                    const audio = audioRef.current;
                    if (audio && audioTrack) {
                      const timelineTime = activeClip
                        ? timelineTimeForClip(timeline, activeClip.id, e.currentTarget.currentTime)
                        : timeline.playhead;
                      const relativeTime = (timelineTime ?? timeline.playhead) - audioTrack.startTime;
                      if (relativeTime >= 0 && relativeTime < audioTrack.duration) {
                        audio.currentTime = relativeTime;
                        void audio.play().catch(() => undefined);
                      }
                    }
                  }}
                  onPause={() => audioRef.current?.pause()}
                  onTimeUpdate={(e) => {
                    const singleSource = mediaItems.length <= 1;
                    const activeClip =
                      timeline.tracks[0]?.clips.find((clip) => clip.id === selectedClipId) ??
                      timeline.tracks[0]?.clips.find((clip) => clip.assetId === media.id);
                    const start = activeClip?.sourceStart ?? (singleSource ? project.trimStart : 0);
                    const end = activeClip
                      ? activeClip.sourceStart + activeClip.duration * activeClip.transform.speed
                      : (singleSource ? (project.trimEnd ?? duration) : duration);
                    const timelineTime = activeClip
                      ? timelineTimeForClip(timeline, activeClip.id, e.currentTarget.currentTime)
                      : null;
                    if (timelineTime !== null) {
                      setTimeline((current) => setTimelinePlayhead(current, timelineTime));
                    }
                    if (!isExportingRef.current && end > start && e.currentTarget.currentTime >= end) {
                      e.currentTarget.pause();
                      e.currentTarget.currentTime = start;
                      const resetTime = activeClip
                        ? timelineTimeForClip(timeline, activeClip.id, start)
                        : null;
                      if (resetTime !== null) {
                        setTimeline((current) => setTimelinePlayhead(current, resetTime));
                      }
                    }
                  }}
                  className="mediaLayer"
                  style={clipMediaStyle(activeMediaClip, transitionVisual.primaryClip?.assetId === media.id ? transitionVisual.primaryOpacity : 1)}
                />
              )}
              {media?.kind === "image" && <img id="creative-image" src={media.url} alt="Creative source" className="mediaLayer" style={clipMediaStyle(activeMediaClip, transitionVisual.primaryClip?.assetId === media.id ? transitionVisual.primaryOpacity : 1)} />}
              {transitionVisual.type === "crossfade" && transitionSecondaryMedia?.kind === "image" && (
                <img
                  data-testid="transition-media-layer"
                  src={transitionSecondaryMedia.url}
                  alt="Transition source"
                  className="mediaLayer transitionMediaLayer"
                  style={clipMediaStyle(transitionVisual.secondaryClip, transitionVisual.secondaryOpacity)}
                />
              )}
              {transitionVisual.blackOpacity > 0 && (
                <div
                  data-testid="transition-blackout"
                  className="transitionBlackout"
                  style={{ opacity: transitionVisual.blackOpacity }}
                />
              )}
              {audioTrack && <audio ref={audioRef} src={audioTrack.url} preload="auto" />}

              {project.overlays.filter((overlay) => isOverlayActive(overlay, timeline.playhead)).map((overlay) => (
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
              {activeCaption && (
                <div
                  className="captionPreview"
                  data-testid="caption-preview"
                  data-preset={captionStyle.presetId}
                  dir={activeCaption.language === "ar" ? "rtl" : "ltr"}
                  style={captionPreviewStyle(captionStyle)}
                >
                  {activeCaption.text}
                </div>
              )}
            </div>
          </div>

          <div className="transport">
            <span>Phase 3 target</span>
            <strong>Automatic timed captions → editable transcript</strong>
            {exportState === "rendering" && <span className="exportState">Local render {exportProgress}%</span>}
            {exportState === "done" && <span className="exportState success">Local export ready</span>}
            {exportState === "error" && <span className="exportState error">{exportError}</span>}
            {serverRender.status !== "idle" && (
              <span
                className={serverRender.status === "failed" ? "serverRenderState error" : serverRender.status === "succeeded" ? "serverRenderState success" : "serverRenderState"}
                data-testid="server-render-state"
                data-job-id={serverRender.jobId ?? ""}
              >
                {serverRender.stage} · {serverRender.progress}%
                {serverRender.error ? ` · ${serverRender.error}` : ""}
              </span>
            )}
          </div>

          <div className="timelinePanel">
            <div className="timelineHeader">
              <div className="timelineMeta">
                <span>Timeline</span>
                <strong data-testid="timeline-clock">{formatTimelineTime(timeline.playhead)}</strong>
                <span>/ {formatTimelineTime(timeline.duration)}</span>
              </div>
              <div className="timelineTools">
                <button
                  type="button"
                  aria-label="Timeline zoom out"
                  onClick={() =>
                    setTimelineZoom((value) =>
                      Math.max(1, Math.round((value - 0.25) * 100) / 100)
                    )
                  }
                >
                  −
                </button>
                <span data-testid="timeline-zoom">{Math.round(timelineZoom * 100)}%</span>
                <button
                  type="button"
                  aria-label="Timeline zoom in"
                  onClick={() =>
                    setTimelineZoom((value) =>
                      Math.min(4, Math.round((value + 0.25) * 100) / 100)
                    )
                  }
                >
                  +
                </button>
                <button
                  type="button"
                  aria-label="Timeline snapping"
                  aria-pressed={snapEnabled}
                  className={snapEnabled ? "timelineSnap active" : "timelineSnap"}
                  onClick={() => setSnapEnabled((value) => !value)}
                >
                  Snap
                </button>
              </div>
            </div>
            <div className="timelineShortcutHint">
              Space play/pause · ←/→ 0.1s · Shift+←/→ 1s · S snap · +/- zoom
            </div>
            <div className="timelineViewport" data-testid="timeline-viewport">
              <div
                className="timelineCanvas"
                data-testid="timeline-canvas"
                data-zoom={timelineZoom.toFixed(2)}
                style={{ width: `${timelineZoom * 100}%` }}
              >
                <div className="timelineRow">
                  <div className="trackLabel">Visual 1</div>
                  <div
                    className="timelineSurface"
                    data-testid="timeline-surface"
                    onClick={scrubTimeline}
                  >
                    {timeline.tracks[0]?.clips.map((clip) => (
                      <div
                        className={selectedClipId === clip.id ? "clip timelineClip active" : "clip timelineClip"}
                        key={clip.id}
                        data-testid="timeline-clip"
                        style={{
                          left: `${timeline.duration > 0 ? (clip.timelineStart / timeline.duration) * 100 : 0}%`,
                          width: `${timeline.duration > 0 ? (clip.duration / timeline.duration) * 100 : 0}%`,
                        }}
                        onClick={() => selectTimelineClip(clip)}
                      >
                        <strong>{clip.assetName}</strong>
                        <span>{formatTimelineTime(clip.duration)}</span>
                        {clip.transitionOut && (
                          <i
                            className="transitionBadge"
                            data-testid="transition-badge"
                            title={`${clip.transitionOut.type} ${clip.transitionOut.duration.toFixed(1)}s`}
                          >
                            {clip.transitionOut.type === "crossfade" ? "XF" : "F"}
                          </i>
                        )}
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
                  <div className="trackLabel">Audio</div>
                  <div className="audioTrackSurface" data-testid="audio-track">
                    {audioTrack && (
                      <button
                        type="button"
                        className="audioTimingBar"
                        data-testid="audio-track-item"
                        data-start={audioTrack.startTime.toFixed(2)}
                        data-duration={audioTrack.duration.toFixed(2)}
                        style={{
                          left: `${timeline.duration > 0 ? (audioTrack.startTime / timeline.duration) * 100 : 0}%`,
                          width: `${timeline.duration > 0 ? (audioTrack.duration / timeline.duration) * 100 : 100}%`,
                        }}
                      >
                        <strong>{audioTrack.name}</strong>
                        <span>{Math.round(audioTrack.gain * 100)}%</span>
                      </button>
                    )}
                    <div
                      className="timelinePlayhead audioPlayhead"
                      style={{
                        left: `${timeline.duration > 0 ? (timeline.playhead / timeline.duration) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="timelineRow">
                  <div className="trackLabel">Captions</div>
                  <div className="captionTrack" data-testid="caption-track">
                    {captions?.cues.map((cue) => (
                      <button
                        type="button"
                        key={cue.id}
                        data-testid="caption-track-item"
                        data-language={cue.language}
                        className={selectedCaptionId === cue.id ? "captionTimingBar active" : "captionTimingBar"}
                        style={{
                          left: `${timeline.duration > 0 ? (cue.startTime / timeline.duration) * 100 : 0}%`,
                          width: `${timeline.duration > 0 ? ((cue.endTime - cue.startTime) / timeline.duration) * 100 : 100}%`,
                        }}
                        onClick={() => selectCaptionCue(cue)}
                      >
                        {cue.text}
                      </button>
                    ))}
                    <div
                      className="timelinePlayhead captionPlayhead"
                      style={{
                        left: `${timeline.duration > 0 ? (timeline.playhead / timeline.duration) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="timelineRow">
                  <div className="trackLabel">Overlays</div>
                  <div className="overlayTrack" data-testid="overlay-track">
                    {project.overlays.map((overlay) => {
                      const start = getOverlayStart(overlay);
                      const end = Math.min(
                        getOverlayEnd(overlay),
                        timeline.duration || getOverlayEnd(overlay)
                      );
                      const width = Math.max(0.1, end - start);
                      return (
                        <button
                          type="button"
                          key={overlay.id}
                          data-testid="overlay-track-item"
                          data-start={start.toFixed(2)}
                          data-end={Number.isFinite(end) ? end.toFixed(2) : "open"}
                          className={selectedId === overlay.id ? "overlayTimingBar active" : "overlayTimingBar"}
                          style={{
                            left: `${timeline.duration > 0 ? (start / timeline.duration) * 100 : 0}%`,
                            width: `${timeline.duration > 0 ? (width / timeline.duration) * 100 : 100}%`,
                          }}
                          onClick={() => setSelectedId(overlay.id)}
                        >
                          {overlay.kind}
                        </button>
                      );
                    })}
                    <div
                      className="timelinePlayhead overlayPlayhead"
                      style={{
                        left: `${timeline.duration > 0 ? (timeline.playhead / timeline.duration) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="panel inspector">
          <h2>Project</h2>
          <label>Name<input value={project.name} onChange={(e) => replaceProject((p) => ({ ...p, name: e.target.value }))} /></label>
          <div className="savePanel">
            <div className="saveStatusRow">
              <span className={`saveIndicator ${saveState}`} data-testid="save-state" data-saved-at={lastSavedAt ?? ""}>
                {saveState === "saving"
                  ? "Saving…"
                  : saveState === "saved"
                    ? "Saved"
                    : saveState === "error"
                      ? "Save error"
                      : "Not saved yet"}
              </span>
              {lastSavedAt && (
                <time>
                  {new Date(lastSavedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </time>
              )}
            </div>
            <small>Autosaves about 0.9s after edits. Manual Save draft also creates a restorable version.</small>
          </div>

          <h2>Versions</h2>
          <div className="snapshotList" data-testid="snapshot-list">
            {snapshots.length === 0 && <p className="hint">No version snapshots yet.</p>}
            {snapshots.map((snapshot) => (
              <button
                type="button"
                key={snapshot.id}
                className="snapshotItem"
                data-testid="snapshot-item"
                disabled={saveState === "saving"}
                onClick={() => void restoreSnapshot(snapshot.id)}
              >
                <span>
                  <strong>{snapshot.projectName}</strong>
                  <small>{snapshot.reason === "manual" ? "Manual" : "Auto"} · {snapshot.mediaCount} asset{snapshot.mediaCount === 1 ? "" : "s"}</small>
                </span>
                <time>
                  {new Date(snapshot.savedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </button>
            ))}
          </div>
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

          <h2>Captions</h2>
          <div className="captionInspector" data-testid="caption-inspector">
            <div className="captionGenerateRow">
              <label>
                Language
                <select
                  aria-label="Caption language"
                  value={captionLanguage}
                  onChange={(e) => setCaptionLanguage(e.target.value as CaptionLanguage)}
                >
                  <option value="auto">Auto detect</option>
                  <option value="ar">Arabic</option>
                  <option value="en">English</option>
                </select>
              </label>
              <button
                type="button"
                className="toolButton"
                onClick={() => void generateCaptions()}
                disabled={captionState === "generating"}
              >
                {captionState === "generating" ? "Generating…" : captions ? "Regenerate captions" : "Generate captions"}
              </button>
            </div>

            <div className="captionStylePanel" data-testid="caption-style-panel">
              <div className="captionPresetGrid">
                {(Object.keys(CAPTION_STYLE_PRESETS) as CaptionPresetId[]).map((presetId) => (
                  <button
                    type="button"
                    key={presetId}
                    className={captionStyle.presetId === presetId ? "captionPreset active" : "captionPreset"}
                    aria-label={`Caption preset ${presetId}`}
                    onClick={() => setCaptionStyle(cloneCaptionStylePreset(presetId))}
                  >
                    {presetId}
                  </button>
                ))}
              </div>
              <div className="captionStyleGrid">
                <label>
                  Position
                  <select
                    aria-label="Caption position"
                    value={captionStyle.position}
                    onChange={(e) =>
                      setCaptionStyle((current) =>
                        normalizeCaptionStyle({
                          ...current,
                          position: e.target.value as CaptionPosition,
                        })
                      )
                    }
                  >
                    <option value="top">Top</option>
                    <option value="center">Center</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </label>
                <label>
                  Emphasis
                  <select
                    aria-label="Caption emphasis"
                    value={captionStyle.emphasis}
                    onChange={(e) =>
                      setCaptionStyle((current) =>
                        normalizeCaptionStyle({
                          ...current,
                          emphasis: e.target.value as CaptionEmphasis,
                        })
                      )
                    }
                  >
                    <option value="none">None</option>
                    <option value="bold">Bold</option>
                    <option value="highlight">Highlight</option>
                  </select>
                </label>
                <label>
                  Font size
                  <input
                    aria-label="Caption font size"
                    type="number"
                    min={14}
                    max={64}
                    value={captionStyle.fontSize}
                    onChange={(e) =>
                      setCaptionStyle((current) =>
                        normalizeCaptionStyle({
                          ...current,
                          fontSize: Number(e.target.value),
                        })
                      )
                    }
                  />
                </label>
                <label>
                  Safe zone %
                  <input
                    aria-label="Caption safe zone"
                    type="number"
                    min={0}
                    max={25}
                    value={captionStyle.safeZone}
                    onChange={(e) =>
                      setCaptionStyle((current) =>
                        normalizeCaptionStyle({
                          ...current,
                          safeZone: Number(e.target.value),
                        })
                      )
                    }
                  />
                </label>
                <label>
                  Max width %
                  <input
                    aria-label="Caption max width"
                    type="number"
                    min={40}
                    max={96}
                    value={captionStyle.maxWidth}
                    onChange={(e) =>
                      setCaptionStyle((current) =>
                        normalizeCaptionStyle({
                          ...current,
                          maxWidth: Number(e.target.value),
                        })
                      )
                    }
                  />
                </label>
                <label className="check">
                  <input
                    aria-label="Caption shadow"
                    type="checkbox"
                    checked={captionStyle.shadow}
                    onChange={(e) =>
                      setCaptionStyle((current) => ({
                        ...current,
                        shadow: e.target.checked,
                      }))
                    }
                  />
                  Shadow
                </label>
              </div>
            </div>
            {captionError && <p className="captionError">{captionError}</p>}
            {captions && (
              <>
                <div className="captionMeta" data-testid="caption-meta">
                  <span>Detected: <strong>{captions.detectedLanguage}</strong></span>
                  <span>{captions.provider} · {captions.model}</span>
                  <span>{captions.cues.length} cues</span>
                </div>
                <div className="captionCueList">
                  {captions.cues.map((cue, index) => (
                    <button
                      type="button"
                      key={cue.id}
                      className={selectedCaptionId === cue.id ? "captionCue active" : "captionCue"}
                      onClick={() => selectCaptionCue(cue)}
                    >
                      <span>{index + 1}</span>
                      <strong>{cue.text}</strong>
                      <small>{formatTimelineTime(cue.startTime)}–{formatTimelineTime(cue.endTime)}</small>
                    </button>
                  ))}
                </div>
              </>
            )}
            {selectedCaption && (
              <div className="captionCueEditor" data-testid="caption-cue-editor">
                <label>
                  Caption text
                  <textarea
                    aria-label="Caption text"
                    value={selectedCaption.text}
                    dir={selectedCaption.language === "ar" ? "rtl" : "ltr"}
                    onChange={(e) => updateCaptionCue(selectedCaption.id, { text: e.target.value })}
                  />
                </label>
                <div className="captionTimeGrid">
                  <label>
                    Start
                    <input
                      aria-label="Caption start"
                      type="number"
                      min={0}
                      max={Math.max(0, selectedCaption.endTime - 0.05)}
                      step="0.1"
                      value={selectedCaption.startTime}
                      onChange={(e) => updateCaptionCue(selectedCaption.id, { startTime: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    End
                    <input
                      aria-label="Caption end"
                      type="number"
                      min={selectedCaption.startTime + 0.05}
                      max={timeline.duration}
                      step="0.1"
                      value={selectedCaption.endTime}
                      onChange={(e) => updateCaptionCue(selectedCaption.id, { endTime: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <label>
                  Cue language
                  <select
                    aria-label="Caption cue language"
                    value={selectedCaption.language}
                    onChange={(e) => updateCaptionCue(selectedCaption.id, { language: e.target.value })}
                  >
                    <option value="ar">Arabic</option>
                    <option value="en">English</option>
                    <option value="und">Undetermined</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="danger"
                  onClick={cutSelectedCaptionFromMedia}
                >
                  Cut spoken range from media
                </button>
              </div>
            )}
          </div>

          <h2>Scene detection</h2>
          <div className="sceneInspector" data-testid="scene-inspector">
            <label>
              Scene threshold
              <input
                aria-label="Scene threshold"
                type="number"
                min={0.05}
                max={0.9}
                step={0.05}
                value={sceneThreshold}
                onChange={(e) => setSceneThreshold(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              className="toolButton"
              onClick={() => void detectScenes()}
              disabled={sceneState === "analyzing"}
            >
              {sceneState === "analyzing" ? "Detecting scenes…" : "Detect scenes"}
            </button>
            {sceneError && <p className="captionError">{sceneError}</p>}
            {sceneSuggestions.length > 0 && (
              <div className="sceneSuggestionList" data-testid="scene-suggestion-list">
                {sceneSuggestions.map((scene) => (
                  <label className="sceneSuggestion" key={scene.id}>
                    <input
                      type="checkbox"
                      aria-label={`Scene boundary ${formatTimelineTime(scene.time)}`}
                      checked={scene.selected}
                      onChange={(e) =>
                        setSceneSuggestions((current) =>
                          current.map((item) =>
                            item.id === scene.id
                              ? { ...item, selected: e.target.checked }
                              : item
                          )
                        )
                      }
                    />
                    <span>{formatTimelineTime(scene.time)}</span>
                  </label>
                ))}
              </div>
            )}
            {sceneSuggestions.length > 0 && (
              <button
                type="button"
                className="toolButton"
                onClick={applySceneSplits}
                disabled={!sceneSuggestions.some((scene) => scene.selected)}
              >
                Apply selected scene splits
              </button>
            )}
            {sceneBackup && (
              <button
                type="button"
                className="ghost sceneUndo"
                onClick={undoSceneSplits}
              >
                Undo scene splits
              </button>
            )}
          </div>

          <h2>Silence detection</h2>
          <div className="silenceInspector" data-testid="silence-inspector">
            <div className="silenceControls">
              <label>
                Threshold dB
                <input
                  aria-label="Silence threshold"
                  type="number"
                  min={-80}
                  max={-10}
                  step={1}
                  value={silenceThresholdDb}
                  onChange={(e) => setSilenceThresholdDb(Number(e.target.value))}
                />
              </label>
              <label>
                Min duration
                <input
                  aria-label="Silence minimum duration"
                  type="number"
                  min={0.1}
                  max={5}
                  step={0.05}
                  value={silenceMinDuration}
                  onChange={(e) => setSilenceMinDuration(Number(e.target.value))}
                />
              </label>
            </div>
            <button
              type="button"
              className="toolButton"
              onClick={() => void detectSilence()}
              disabled={silenceState === "analyzing"}
            >
              {silenceState === "analyzing" ? "Analyzing silence…" : "Detect silence"}
            </button>
            {silenceError && <p className="captionError">{silenceError}</p>}
            {silenceRanges.length > 0 && (
              <div className="silenceRangeList" data-testid="silence-range-list">
                {silenceRanges.map((range) => (
                  <label className="silenceRange" key={range.id}>
                    <input
                      type="checkbox"
                      aria-label={`Silence range ${formatTimelineTime(range.startTime)}`}
                      checked={range.selected}
                      onChange={(e) =>
                        setSilenceRanges((current) =>
                          current.map((item) =>
                            item.id === range.id
                              ? { ...item, selected: e.target.checked }
                              : item
                          )
                        )
                      }
                    />
                    <span>
                      {formatTimelineTime(range.startTime)}–{formatTimelineTime(range.endTime)}
                    </span>
                    <strong>{range.duration.toFixed(2)}s</strong>
                  </label>
                ))}
              </div>
            )}
            {silenceRanges.length > 0 && (
              <button
                type="button"
                className="danger"
                disabled={
                  silenceSourceKind !== "video" ||
                  !silenceRanges.some((range) => range.selected)
                }
                onClick={applySelectedSilenceCuts}
              >
                Apply selected silence cuts
              </button>
            )}
            {silenceSourceKind === "audio" && silenceRanges.length > 0 && (
              <p className="hint">
                Audio-only silence is reviewable now; automatic removal is enabled for video clips.
              </p>
            )}
          </div>

          <h2>Audio track</h2>
          {!audioTrack && <p className="hint">Add music or audio from the Elements panel.</p>}
          {audioTrack && (
            <div className="audioInspector" data-testid="audio-inspector">
              <div className="clipMeta">
                <strong>{audioTrack.name}</strong>
                <span>audio</span>
              </div>
              <label>
                Start
                <input
                  aria-label="Audio start"
                  type="number"
                  min={0}
                  max={Math.max(0, timeline.duration - 0.1)}
                  step="0.1"
                  value={audioTrack.startTime}
                  onChange={(e) => updateAudioTrack({ startTime: Number(e.target.value) })}
                />
              </label>
              <label>
                Duration
                <input
                  aria-label="Audio duration"
                  type="number"
                  min={0.1}
                  max={Math.max(0.1, timeline.duration - audioTrack.startTime)}
                  step="0.1"
                  value={audioTrack.duration}
                  onChange={(e) => updateAudioTrack({ duration: Number(e.target.value) })}
                />
              </label>
              <label>
                Gain
                <input
                  aria-label="Audio gain"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={audioTrack.gain}
                  onChange={(e) => updateAudioTrack({ gain: Number(e.target.value) })}
                />
              </label>
              <div className="audioFadeGrid">
                <label>
                  Fade in
                  <input
                    aria-label="Audio fade in"
                    type="number"
                    min={0}
                    max={audioTrack.duration}
                    step="0.1"
                    value={audioTrack.fadeIn}
                    onChange={(e) => updateAudioTrack({ fadeIn: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Fade out
                  <input
                    aria-label="Audio fade out"
                    type="number"
                    min={0}
                    max={audioTrack.duration}
                    step="0.1"
                    value={audioTrack.fadeOut}
                    onChange={(e) => updateAudioTrack({ fadeOut: Number(e.target.value) })}
                  />
                </label>
              </div>
              <button type="button" className="danger" onClick={() => setAudioTrack(null)}>Remove audio</button>
            </div>
          )}

          <h2>Selected clip</h2>
          {!selectedClip && <p className="hint">Select a clip on Visual 1.</p>}
          {selectedClip && (
            <div className="clipInspector" data-testid="clip-inspector">
              <div className="clipMeta">
                <strong>{selectedClip.assetName}</strong>
                <span>{selectedClip.kind}</span>
              </div>
              <label>
                Source start
                <input
                  aria-label="Clip source start"
                  type="number"
                  min={0}
                  max={selectedClip.sourceDuration ?? undefined}
                  step="0.1"
                  disabled={selectedClip.kind === "image"}
                  value={selectedClip.sourceStart}
                  onChange={(e) => updateSelectedClipTrim("sourceStart", Number(e.target.value))}
                />
              </label>
              <label>
                Clip duration
                <input
                  aria-label="Clip duration"
                  type="number"
                  min={0.1}
                  max={
                    selectedClip.sourceDuration !== null
                      ? Math.max(
                          0.1,
                          (selectedClip.sourceDuration - selectedClip.sourceStart) /
                            Math.max(0.01, selectedClip.transform.speed)
                        )
                      : undefined
                  }
                  step="0.1"
                  value={selectedClip.duration}
                  onChange={(e) => updateSelectedClipTrim("duration", Number(e.target.value))}
                />
              </label>
              <div className="transformInspector" data-testid="transform-inspector">
                <label>
                  Fit mode
                  <select
                    aria-label="Clip fit"
                    value={selectedClip.transform.fit}
                    onChange={(e) =>
                      updateSelectedClipTransform({ fit: e.target.value as ClipFitMode })
                    }
                  >
                    <option value="cover">Crop / Cover</option>
                    <option value="contain">Fit</option>
                    <option value="fill">Fill</option>
                  </select>
                </label>
                <div className="transformGrid">
                  <label>
                    Crop X
                    <input
                      aria-label="Clip crop X"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={selectedClip.transform.cropX}
                      onChange={(e) =>
                        updateSelectedClipTransform({ cropX: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Crop Y
                    <input
                      aria-label="Clip crop Y"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={selectedClip.transform.cropY}
                      onChange={(e) =>
                        updateSelectedClipTransform({ cropY: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Zoom
                    <input
                      aria-label="Clip zoom"
                      type="number"
                      min={1}
                      max={3}
                      step={0.1}
                      value={selectedClip.transform.zoom}
                      onChange={(e) =>
                        updateSelectedClipTransform({ zoom: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Rotation
                    <input
                      aria-label="Clip rotation"
                      type="number"
                      min={-180}
                      max={180}
                      step={1}
                      value={selectedClip.transform.rotation}
                      onChange={(e) =>
                        updateSelectedClipTransform({ rotation: Number(e.target.value) })
                      }
                    />
                  </label>
                </div>
                {selectedClip.kind === "video" && (
                  <label>
                    Speed
                    <select
                      aria-label="Clip speed"
                      value={selectedClip.transform.speed}
                      onChange={(e) =>
                        updateSelectedClipTransform({ speed: Number(e.target.value) })
                      }
                    >
                      <option value="0.25">0.25×</option>
                      <option value="0.5">0.5×</option>
                      <option value="0.75">0.75×</option>
                      <option value="1">1×</option>
                      <option value="1.25">1.25×</option>
                      <option value="1.5">1.5×</option>
                      <option value="2">2×</option>
                      <option value="3">3×</option>
                      <option value="4">4×</option>
                    </select>
                  </label>
                )}
              </div>
              <div className="smartReframePanel" data-testid="smart-reframe-panel">
                <div className="smartReframeButtons">
                  <button type="button" onClick={() => applySmartReframe("9:16")}>Smart 9:16</button>
                  <button type="button" onClick={() => applySmartReframe("4:5")}>Smart 4:5</button>
                  <button type="button" onClick={() => applySmartReframe("1:1")}>Smart 1:1</button>
                  <button type="button" onClick={() => applySmartReframe("16:9")}>Smart 16:9</button>
                </div>
                {smartReframeAnchor && smartReframeState === "ready" && (
                  <small data-testid="smart-reframe-result">
                    Subject anchor {smartReframeAnchor.x.toFixed(1)}% × {smartReframeAnchor.y.toFixed(1)}% · confidence {Math.round(smartReframeAnchor.confidence * 100)}%
                  </small>
                )}
                {smartReframeError && <p className="captionError">{smartReframeError}</p>}
              </div>
              {selectedNextClip ? (
                <div className="transitionInspector" data-testid="transition-inspector">
                  <label>
                    Transition to next
                    <select
                      aria-label="Transition type"
                      value={selectedClip.transitionOut?.type ?? "none"}
                      onChange={(e) => updateSelectedTransitionType(e.target.value as TransitionType)}
                    >
                      <option value="none">None</option>
                      <option value="fade">Fade</option>
                      <option
                        value="crossfade"
                        disabled={!isCrossfadeEligible(selectedClip, selectedNextClip)}
                      >
                        Crossfade
                      </option>
                    </select>
                  </label>
                  {selectedClip.transitionOut && (
                    <label>
                      Transition duration
                      <input
                        aria-label="Transition duration"
                        type="number"
                        min={0.1}
                        max={getMaxTransitionDuration(selectedClip, selectedNextClip)}
                        step="0.1"
                        value={selectedClip.transitionOut.duration}
                        onChange={(e) => updateSelectedTransitionDuration(Number(e.target.value))}
                      />
                    </label>
                  )}
                  <small>
                    {isCrossfadeEligible(selectedClip, selectedNextClip)
                      ? "Fade and image crossfade are available."
                      : "Fade is available. Crossfade currently requires image → image."}
                  </small>
                </div>
              ) : (
                <p className="hint">Last clip has no outgoing transition.</p>
              )}
              <div className="clipActionGrid">
                <button type="button" onClick={splitSelectedClip}>Split at playhead</button>
                <button type="button" onClick={duplicateSelectedClip}>Duplicate clip</button>
                <button type="button" onClick={() => moveSelectedClip(-1)}>Move clip earlier</button>
                <button type="button" onClick={() => moveSelectedClip(1)}>Move clip later</button>
              </div>
              <button type="button" className="danger" onClick={deleteSelectedClip}>Delete clip</button>
            </div>
          )}

          <h2>Selected element</h2>
          {!selected && <p className="hint">Select a text or logo on the stage or overlay track.</p>}
          {selected && timeline.duration > 0 && (
            <div className="overlayTimingInspector">
              <label>
                Overlay start
                <input
                  aria-label="Overlay start"
                  type="number"
                  min={0}
                  max={Math.max(0, getOverlayEnd(selected) - 0.1)}
                  step="0.1"
                  value={getOverlayStart(selected)}
                  onChange={(e) => {
                    const end = Math.min(getOverlayEnd(selected), timeline.duration);
                    const value = Math.max(0, Math.min(Number(e.target.value), Math.max(0, end - 0.1)));
                    updateOverlay(selected.id, { startTime: value } as Partial<Overlay>);
                  }}
                />
              </label>
              <label>
                Overlay end
                <input
                  aria-label="Overlay end"
                  type="number"
                  min={getOverlayStart(selected) + 0.1}
                  max={timeline.duration}
                  step="0.1"
                  value={Math.min(getOverlayEnd(selected), timeline.duration)}
                  onChange={(e) => {
                    const value = Math.max(
                      getOverlayStart(selected) + 0.1,
                      Math.min(Number(e.target.value), timeline.duration)
                    );
                    updateOverlay(selected.id, { endTime: value } as Partial<Overlay>);
                  }}
                />
              </label>
            </div>
          )}
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
            <b>P2 timed overlays</b>
            <span>Text and logo overlays now have independent start/end timing on the timeline, and preview/export respect their active range.</span>
          </div>
        </aside>
      </section>
    </main>
  );
}
