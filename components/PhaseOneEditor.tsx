"use client";

import { ChangeEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CAPTION_STYLE_PRESETS, captionCueAtTime, cloneCaptionStylePreset, normalizeCaptionStyle, normalizeCaptionTrack, type CaptionCue, type CaptionEmphasis, type CaptionLanguage, type CaptionPosition, type CaptionPresetId, type CaptionStyleConfig, type CaptionTrack } from "../lib/editor/captions";
import { brandCaptionDefaults, DEFAULT_BRAND_KIT, normalizeBrandKit, type BrandKit } from "../lib/editor/brand-kit";
import type { CreatorProject, Overlay, OverlayBlendMode, OverlayEasing, OverlayKeyframe, OverlayMaskShape, RatioKey, TextOverlay } from "../lib/editor/types";
import { listPhaseTwoSnapshots, loadBrandKit, loadPhaseOneDraft, loadPhaseTwoDraft, loadPhaseTwoSnapshot, saveBrandKit, savePhaseTwoDraft, savePhaseTwoSnapshot, type HydratedPhaseTwoState, type PhaseTwoSaveInput, type PhaseTwoSnapshotSummary, type ReviewComment, type ProjectApproval, type ApprovalStatus } from "../lib/editor/storage";
import { buildSequentialTimeline, createEmptyTimeline, deleteTimelineClip, duplicateTimelineClip, formatTimelineTime, getMaxTransitionDuration, getNextTimelineClip, getTransitionVisualState, isCrossfadeEligible, moveTimelineClip, normalizeClipChroma, normalizeClipColorGrade, removeTimelineRange, resolveTimelineTime, setTimelineClipTransition, setTimelinePlayhead, splitTimelineClip, timelineTimeForClip, trimTimelineClip, updateTimelineClipChroma, updateTimelineClipColorGrade, updateTimelineClipTransform, type ClipChromaKey, type ClipFitMode, type ClipLutPreset, type TimelineClip, type TimelineState, type TransitionType } from "../lib/editor/timeline";
import { instantiateMarketingTemplate, MARKETING_TEMPLATES, type MarketingTemplateId } from "../lib/editor/templates";
import { compileEditorCommand, type EditorCommandPlan } from "../lib/editor/command-bar";
import type { ProviderCapability, ProviderDirectorySnapshot, ProviderArtifact } from "../lib/providers/contracts";
import { withDefaultProvenance, type AssetGenerationMetadata, type AssetReviewStatus, type GenerationRecord } from "../lib/editor/assets";
import type { BrollOption, StoryboardAssetNeed, StoryboardPlan, StoryboardScene } from "../lib/editor/storyboard";
import { buildCreativeConcepts, type CreativeConcept } from "../lib/marketing/brief";
import { buildCampaignVariants, type CampaignVariant } from "../lib/marketing/variants";
import { buildBoundedExperiments, buildLanguageVariants, type CampaignExperiment, type CampaignLanguageVariant } from "../lib/marketing/experiments";
import { runBrandGuardian } from "../lib/marketing/guardian";
import { MAX_BATCH_ROWS, parseBatchCsv, type BatchGenerationResult } from "../lib/scale/batch";
import type { PublishingConnector, PublishingHandoff } from "../lib/scale/publishing";
import { EMPTY_MARKETING_BRIEF, normalizeMarketingBrief, validateMarketingBrief, type MarketingBrief, type MarketingLanguage, type MarketingPlatform } from "../lib/editor/marketing";
import { createOverlayKeyframe, deleteOverlayKeyframe, resolveOverlayAnimation, upsertOverlayKeyframe } from "../lib/editor/keyframes";
import { applyMotionPreset, MOTION_PRESETS, type MotionPresetId } from "../lib/editor/motion-presets";
import { applyMotionComponent, captureMotionComponent, type MotionComponent } from "../lib/editor/motion-components";
import { canvasCompositeOperation, normalizeOverlayBlendMode, normalizeOverlayMask, overlayClipPath } from "../lib/editor/compositing";
import type { ServerRenderManifest } from "../lib/render/server-types";

const RATIOS: Record<RatioKey, { w: number; h: number }> = {
  "9:16": { w: 9, h: 16 },
  "1:1": { w: 1, h: 1 },
  "4:5": { w: 4, h: 5 },
  "16:9": { w: 16, h: 9 },
};

const MARKETING_PLATFORMS: Array<{ id: MarketingPlatform; label: string }> = [
  { id: "instagram-reels", label: "Instagram Reels" },
  { id: "instagram-feed", label: "Instagram Feed" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube-shorts", label: "YouTube Shorts" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X" },
  { id: "snapchat", label: "Snapchat" },
];

const MARKETING_LANGUAGES: Array<{ id: MarketingLanguage; label: string }> = [
  { id: "ar", label: "Arabic" },
  { id: "en", label: "English" },
];

const initialApproval: ProjectApproval = {
  status: "draft",
  updatedAt: null,
  note: "",
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

type MediaItem = { id: string; kind: "video" | "image"; url: string; name: string; type: string; blob: Blob; duration: number; generation?: AssetGenerationMetadata; proxyBlob?: Blob; proxyUrl?: string; proxyType?: string; proxySize?: number; proxySourceSize?: number; proxyGeneratedAt?: number; proxyCacheKey?: string };
type MediaState = MediaItem | null;
type WorkspaceView = "editor" | "campaign" | "batch" | "publishing";
type EditorTool = "media" | "text" | "brand" | "ai" | "captions" | "audio" | "templates";
type InspectorTab = "properties" | "review" | "advanced";
type AudioTrackRole = "music" | "voiceover" | "sfx";
type AudioTrackItem = { id: string; url: string; name: string; type: string; blob: Blob; duration: number; startTime: number; gain: number; fadeIn: number; fadeOut: number; duckingEnabled: boolean; duckingGain: number; role: AudioTrackRole; normalizeEnabled: boolean; normalizeTarget: number; measuredPeak: number | null; generation?: AssetGenerationMetadata };
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

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read brand logo."));
    reader.readAsDataURL(file);
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
    fontFamily: style.fontFamily,
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

function clipCanvasOverlayMask(
  ctx: CanvasRenderingContext2D,
  overlay: Overlay,
  width: number,
  height: number,
  centered = false
) {
  const mask = normalizeOverlayMask(overlay.mask);
  if (mask.shape === "none") return;

  const insetX = (mask.inset / 100) * width;
  const insetY = (mask.inset / 100) * height;
  const left = centered ? -width / 2 + insetX : insetX;
  const top = centered ? -height / 2 + insetY : insetY;
  const clippedWidth = Math.max(1, width - insetX * 2);
  const clippedHeight = Math.max(1, height - insetY * 2);

  ctx.beginPath();
  if (mask.shape === "ellipse") {
    const centerX = centered ? 0 : width / 2;
    const centerY = centered ? 0 : height / 2;
    ctx.ellipse(
      centerX,
      centerY,
      clippedWidth / 2,
      clippedHeight / 2,
      0,
      0,
      Math.PI * 2
    );
  } else {
    ctx.rect(left, top, clippedWidth, clippedHeight);
  }
  ctx.clip();
}

function applyChromaKeyPixels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  chromaInput?: Partial<ClipChromaKey> | null
) {
  const chroma = normalizeClipChroma(chromaInput);
  if (!chroma.enabled || width <= 0 || height <= 0) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const key = hexToRgb(chroma.keyColor);
  const maxDistance = Math.sqrt(255 * 255 * 3);
  const threshold = chroma.tolerance * maxDistance;
  const feather = Math.max(6, threshold * 0.35);
  const dominant =
    key.r >= key.g && key.r >= key.b
      ? 0
      : key.g >= key.r && key.g >= key.b
        ? 1
        : 2;

  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - key.r;
    const dg = data[i + 1] - key.g;
    const db = data[i + 2] - key.b;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);

    if (distance <= threshold) {
      data[i + 3] = 0;
      continue;
    }

    if (distance < threshold + feather) {
      data[i + 3] = Math.round(
        data[i + 3] * ((distance - threshold) / feather)
      );
    }

    if (chroma.spill > 0 && distance < threshold + feather * 2.5) {
      const closeness = 1 - Math.min(1, distance / (threshold + feather * 2.5));
      const channels = [data[i], data[i + 1], data[i + 2]];
      const otherMax = Math.max(
        channels[(dominant + 1) % 3],
        channels[(dominant + 2) % 3]
      );
      channels[dominant] = Math.round(
        channels[dominant] -
          Math.max(0, channels[dominant] - otherMax) *
            chroma.spill *
            closeness
      );
      data[i] = channels[0];
      data[i + 1] = channels[1];
      data[i + 2] = channels[2];
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const parsed = Number.parseInt(normalized, 16);
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

function audioNormalizationGain(track: AudioTrackItem) {
  if (
    !track.normalizeEnabled ||
    track.measuredPeak === null ||
    track.measuredPeak <= 0.0001
  ) {
    return 1;
  }
  return Math.max(
    0.25,
    Math.min(2, track.normalizeTarget / track.measuredPeak)
  );
}

async function measureAudioPeak(blob: Blob): Promise<number | null> {
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) return null;

    const context = new AudioContextCtor();
    try {
      const buffer = await context.decodeAudioData(await blob.arrayBuffer());
      let peak = 0;
      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const samples = buffer.getChannelData(channel);
        for (let index = 0; index < samples.length; index += 1) {
          peak = Math.max(peak, Math.abs(samples[index]));
        }
      }
      return Number.isFinite(peak) ? peak : null;
    } finally {
      await context.close().catch(() => undefined);
    }
  } catch {
    return null;
  }
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
    clipCanvasOverlayMask(ctx, overlay, width, height, false);
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
  measureCtx.font = `${overlay.fontWeight} ${fontSize}px ${overlay.fontFamily ?? "Arial, sans-serif"}`;
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
  clipCanvasOverlayMask(ctx, overlay, width, height, false);
  ctx.font = `${overlay.fontWeight} ${fontSize}px ${overlay.fontFamily ?? "Arial, sans-serif"}`;
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
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("editor");
  const [editorTool, setEditorTool] = useState<EditorTool>("media");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("properties");
  const [project, setProject] = useState<CreatorProject>(initialProject);
  const [media, setMedia] = useState<MediaState>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [timeline, setTimeline] = useState(createEmptyTimeline);
  const [audioTrack, setAudioTrack] = useState<AudioTrackItem | null>(null);
  const [captions, setCaptions] = useState<CaptionTrack | null>(null);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyleConfig>(() => cloneCaptionStylePreset("clean"));
  const [brandKit, setBrandKit] = useState<BrandKit>(() => normalizeBrandKit(DEFAULT_BRAND_KIT));
  const [brandState, setBrandState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [commandInput, setCommandInput] = useState("");
  const [commandPlan, setCommandPlan] = useState<EditorCommandPlan | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [providerDirectory, setProviderDirectory] = useState<ProviderDirectorySnapshot | null>(null);
  const [providerState, setProviderState] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [providerError, setProviderError] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageGenerationState, setImageGenerationState] = useState<"idle" | "generating" | "error">("idle");
  const [imageGenerationError, setImageGenerationError] = useState<string | null>(null);
  const [imageEditPrompt, setImageEditPrompt] = useState("");
  const [imageToolState, setImageToolState] = useState<"idle" | "working" | "error">("idle");
  const [imageToolError, setImageToolError] = useState<string | null>(null);
  const [videoPrompt, setVideoPrompt] = useState("");
  const [videoDurationSeconds, setVideoDurationSeconds] = useState(5);
  const [videoGenerationState, setVideoGenerationState] = useState<"idle" | "generating" | "error">("idle");
  const [videoGenerationError, setVideoGenerationError] = useState<string | null>(null);
  const [voiceText, setVoiceText] = useState("");
  const [voiceLanguage, setVoiceLanguage] = useState<"auto" | "ar" | "en">("auto");
  const [voiceGenerationState, setVoiceGenerationState] = useState<"idle" | "generating" | "error">("idle");
  const [voiceGenerationError, setVoiceGenerationError] = useState<string | null>(null);
  const [storyboardBrief, setStoryboardBrief] = useState("");
  const [storyboard, setStoryboard] = useState<StoryboardPlan | null>(null);
  const [storyboardState, setStoryboardState] = useState<"idle" | "generating" | "error">("idle");
  const [storyboardError, setStoryboardError] = useState<string | null>(null);
  const [generationLedger, setGenerationLedger] = useState<GenerationRecord[]>([]);
  const [marketingBrief, setMarketingBrief] = useState<MarketingBrief>(() => normalizeMarketingBrief(EMPTY_MARKETING_BRIEF));
  const [creativeConcepts, setCreativeConcepts] = useState<CreativeConcept[]>([]);
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [campaignVariants, setCampaignVariants] = useState<CampaignVariant[]>([]);
  const [languageVariants, setLanguageVariants] = useState<CampaignLanguageVariant[]>([]);
  const [campaignExperiments, setCampaignExperiments] = useState<CampaignExperiment[]>([]);
  const [campaignPackState, setCampaignPackState] = useState<"idle" | "exporting" | "error">("idle");
  const [campaignPackError, setCampaignPackError] = useState<string | null>(null);
  const [batchCsv, setBatchCsv] = useState("name,headline,body,cta,ratio,language,template\nCampaign A,Main hook,Supporting copy,Learn more,9:16,en,product-spotlight");
  const [batchTemplate, setBatchTemplate] = useState<MarketingTemplateId>("product-spotlight");
  const [batchState, setBatchState] = useState<"idle" | "generating" | "ready" | "error">("idle");
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<BatchGenerationResult | null>(null);
  const [publishingConnectors, setPublishingConnectors] = useState<PublishingConnector[]>([]);
  const [publishingConnectorId, setPublishingConnectorId] = useState("");
  const [publishingWorkspaceId, setPublishingWorkspaceId] = useState("nemdar-local");
  const [publishingAccountId, setPublishingAccountId] = useState("sandbox-account");
  const [publishingCaption, setPublishingCaption] = useState("");
  const [publishingSchedule, setPublishingSchedule] = useState("");
  const [publishingHandoffs, setPublishingHandoffs] = useState<PublishingHandoff[]>([]);
  const [publishingState, setPublishingState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [publishingError, setPublishingError] = useState<string | null>(null);
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
  const chromaPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
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
  const [reviewComments, setReviewComments] = useState<ReviewComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [approval, setApproval] = useState<ProjectApproval>(initialApproval);
  const [approvalNote, setApprovalNote] = useState("");
  const [motionComponents, setMotionComponents] = useState<MotionComponent[]>([]);
  const [motionComponentName, setMotionComponentName] = useState("");
  const [storageHydrated, setStorageHydrated] = useState(false);
  const autosaveTimerRef = useRef<number | null>(null);
  const brandAutosaveTimerRef = useRef<number | null>(null);
  const lastAutoSnapshotAtRef = useRef(0);
  const undoStack = useRef<CreatorProject[]>([]);
  const redoStack = useRef<CreatorProject[]>([]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        setProviderState("loading");
        const response = await fetch("/api/providers");
        const payload = (await response.json()) as ProviderDirectorySnapshot & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error || "Unable to load AI providers.");
        }
        if (!cancelled) {
          setProviderDirectory(payload);
          setProviderState("ready");
          setProviderError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setProviderState("error");
          setProviderError(
            error instanceof Error ? error.message : "Unable to load AI providers."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        setPublishingState("loading");
        const response = await fetch("/api/publishing/connectors");
        const payload = (await response.json()) as {
          connectors?: PublishingConnector[];
          error?: string;
        };
        if (!response.ok || !Array.isArray(payload.connectors)) {
          throw new Error(payload.error || "Unable to load publishing connectors.");
        }
        if (!cancelled) {
          setPublishingConnectors(payload.connectors);
          setPublishingConnectorId(
            (current) => current || payload.connectors?.[0]?.id || ""
          );
          setPublishingState("ready");
          setPublishingError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setPublishingState("error");
          setPublishingError(
            error instanceof Error
              ? error.message
              : "Unable to load publishing connectors."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
    const speechActive = Boolean(captionCueAtTime(captions, timeline.playhead));
    const duckingMultiplier = audioTrack.duckingEnabled && speechActive ? audioTrack.duckingGain : 1;
    const normalizationMultiplier = audioNormalizationGain(audioTrack);
    audio.volume = Math.max(
      0,
      Math.min(
        1,
        audioTrack.gain *
          normalizationMultiplier *
          Math.min(fadeInGain, fadeOutGain) *
          duckingMultiplier
      )
    );
    audio.dataset.effectiveGain = audio.volume.toFixed(3);
    audio.dataset.normalizationGain = normalizationMultiplier.toFixed(3);
    audio.dataset.trackRole = audioTrack.role;

    if (videoRef.current && !videoRef.current.paused && audio.paused) {
      void audio.play().catch(() => undefined);
    }
  }, [timeline.playhead, audioTrack, captions]);

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

  const marketingBriefValidation = useMemo(
    () => validateMarketingBrief(marketingBrief),
    [marketingBrief]
  );

  const brandGuardian = useMemo(
    () =>
      runBrandGuardian({
        project,
        brandKit,
        brief: marketingBrief,
        captions,
      }),
    [project, brandKit, marketingBrief, captions]
  );

  const selected = useMemo(
    () => project.overlays.find((overlay) => overlay.id === selectedId) ?? null,
    [project.overlays, selectedId]
  );

  const selectedKeyframe = useMemo(
    () => selected?.keyframes?.find((keyframe) => keyframe.id === selectedKeyframeId) ?? null,
    [selected, selectedKeyframeId]
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

  useEffect(() => {
    const chroma = normalizeClipChroma(activeMediaClip?.chroma);
    const canvas = chromaPreviewCanvasRef.current;
    if (!media || !canvas || !chroma.enabled) return;

    const ratio = RATIOS[project.ratio];
    const width = 480;
    const height = Math.max(1, Math.round(width * (ratio.h / ratio.w)));
    canvas.width = width;
    canvas.height = height;

    let animationFrame = 0;
    const video = media.kind === "video" ? videoRef.current : null;
    const image =
      media.kind === "image"
        ? (document.getElementById("creative-image") as HTMLImageElement | null)
        : null;

    const render = () => {
      const ctx = canvas.getContext("2d");
      const source = video ?? image;
      if (!ctx || !source) return;

      const ready =
        source instanceof HTMLVideoElement
          ? source.readyState >= 2
          : source.complete && source.naturalWidth > 0;

      if (ready) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawMediaFrame(ctx, source, canvas.width, canvas.height, activeMediaClip);
      }

      if (video && !video.paused && !video.ended) {
        animationFrame = requestAnimationFrame(render);
      }
    };

    const onFrame = () => render();
    video?.addEventListener("play", onFrame);
    video?.addEventListener("seeked", onFrame);
    video?.addEventListener("timeupdate", onFrame);
    image?.addEventListener("load", onFrame);
    render();

    return () => {
      cancelAnimationFrame(animationFrame);
      video?.removeEventListener("play", onFrame);
      video?.removeEventListener("seeked", onFrame);
      video?.removeEventListener("timeupdate", onFrame);
      image?.removeEventListener("load", onFrame);
    };
  }, [media, activeMediaClip, project.ratio, timeline.playhead]);

  function clipColorFilter(clip: TimelineClip | null) {
    const grade = normalizeClipColorGrade(clip?.colorGrade);
    const brightness = Math.pow(2, grade.exposure);
    const filters = [
      `brightness(${brightness.toFixed(3)})`,
      `contrast(${grade.contrast.toFixed(3)})`,
      `saturate(${grade.saturation.toFixed(3)})`,
    ];

    if (grade.lut === "warm") {
      filters.push("sepia(0.16)", "saturate(1.08)", "hue-rotate(-7deg)");
    } else if (grade.lut === "cool") {
      filters.push("saturate(1.05)", "hue-rotate(8deg)");
    } else if (grade.lut === "cinematic") {
      filters.push("contrast(1.08)", "saturate(0.9)", "sepia(0.07)");
    } else if (grade.lut === "mono") {
      filters.push("grayscale(1)");
    }

    return filters.join(" ");
  }

  function clipMediaStyle(
    clip: TimelineClip | null,
    opacity = 1
  ): CSSProperties {
    const transform = clip?.transform;
    const chroma = normalizeClipChroma(clip?.chroma);
    return {
      opacity,
      objectFit: transform?.fit === "fill" ? "fill" : transform?.fit ?? "cover",
      objectPosition: `${transform?.cropX ?? 50}% ${transform?.cropY ?? 50}%`,
      transform: `rotate(${transform?.rotation ?? 0}deg) scale(${transform?.zoom ?? 1})`,
      transformOrigin: "center",
      filter: chroma.enabled ? undefined : clipColorFilter(clip),
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

  async function ensureMediaProxy(item: MediaItem) {
    try {
      const form = new FormData();
      form.append("file", item.blob, item.name);
      form.append("kind", item.kind);

      const response = await fetch("/api/proxy", {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        throw new Error(`Proxy request failed (${response.status}).`);
      }

      const proxyBlob = await response.blob();
      if (!proxyBlob.size) throw new Error("Proxy response was empty.");

      const proxyUrl = createObjectUrl(proxyBlob);
      const headerNumber = (name: string, fallback: number) => {
        const value = Number(response.headers.get(name));
        return Number.isFinite(value) && value > 0 ? value : fallback;
      };
      const patch: Partial<MediaItem> = {
        proxyBlob,
        proxyUrl,
        proxyType: response.headers.get("content-type") || proxyBlob.type || undefined,
        proxySize: headerNumber("x-nemdar-proxy-bytes", proxyBlob.size),
        proxySourceSize: headerNumber("x-nemdar-source-bytes", item.blob.size),
        proxyGeneratedAt: Date.now(),
        proxyCacheKey: response.headers.get("x-nemdar-proxy-cache-key") || undefined,
      };

      setMediaItems((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, ...patch } : entry))
      );
      setMedia((current) =>
        current?.id === item.id ? { ...current, ...patch } : current
      );
    } catch (error) {
      console.warn("Proxy generation failed; continuing with original media.", error);
    }
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

    for (const item of nextItems) {
      void ensureMediaProxy(item);
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
    const [audioDuration, measuredPeak] = await Promise.all([
      probeAudioDuration(url),
      measureAudioPeak(file),
    ]);
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
      duckingEnabled: false,
      duckingGain: 0.3,
      role: "music",
      normalizeEnabled: false,
      normalizeTarget: 0.85,
      measuredPeak,
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
      next.duckingGain = Math.max(0, Math.min(1, next.duckingGain ?? 0.3));
      next.duckingEnabled = Boolean(next.duckingEnabled);
      next.role = next.role === "voiceover" || next.role === "sfx" ? next.role : "music";
      next.normalizeEnabled = Boolean(next.normalizeEnabled);
      next.normalizeTarget = Math.max(0.1, Math.min(1, next.normalizeTarget ?? 0.85));
      next.measuredPeak = next.measuredPeak === null || Number.isFinite(next.measuredPeak) ? next.measuredPeak : null;
      return next;
    });
  }

  function updateBrandKit(patch: Partial<BrandKit>) {
    setBrandKit((current) => normalizeBrandKit({ ...current, ...patch }));
  }

  async function onBrandLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    try {
      const logoDataUrl = await fileToDataUrl(file);
      updateBrandKit({
        logoDataUrl,
        logoName: file.name,
      });
    } catch {
      setBrandState("error");
    } finally {
      event.target.value = "";
    }
  }

  function applyBrandKitToProject() {
    const timing = defaultOverlayTiming();
    const min = brandKit.safeZone;
    const max = 100 - brandKit.safeZone;
    let logoFound = false;

    const brandedOverlays = project.overlays.map((overlay) => {
      if (overlay.kind === "text") {
        return {
          ...overlay,
          x: Math.max(min, Math.min(max, overlay.x)),
          y: Math.max(min, Math.min(max, overlay.y)),
          fontFamily: brandKit.headingFont,
          fontWeight: brandKit.headingWeight,
          color: brandKit.primaryColor,
        };
      }

      if (overlay.id === "brand-kit-logo" && brandKit.logoDataUrl) {
        logoFound = true;
        return {
          ...overlay,
          src: brandKit.logoDataUrl,
          x: brandKit.logoX,
          y: brandKit.logoY,
          width: brandKit.logoWidth,
        };
      }

      return overlay;
    });

    if (brandKit.logoDataUrl && !logoFound) {
      brandedOverlays.push({
        id: "brand-kit-logo",
        kind: "image",
        src: brandKit.logoDataUrl,
        x: brandKit.logoX,
        y: brandKit.logoY,
        width: brandKit.logoWidth,
        opacity: 1,
        ...timing,
      });
    }

    const nextProject: CreatorProject = {
      ...project,
      overlays: brandedOverlays,
    };
    const nextCaptionStyle = normalizeCaptionStyle(
      brandCaptionDefaults(brandKit, captionStyle)
    );

    replaceProject(() => nextProject);
    setCaptionStyle(nextCaptionStyle);

    void (async () => {
      try {
        setSaveState("saving");
        const savedAt = await savePhaseTwoDraft({
          ...buildPhaseTwoSaveInput(),
          project: nextProject,
          captionStyle: nextCaptionStyle,
          brandKit,
        });
        await saveBrandKit(brandKit);
        setLastSavedAt(savedAt);
        setSaveState("saved");
        setBrandState("saved");
      } catch {
        setSaveState("error");
        setBrandState("error");
      }
    })();
  }

  function startMarketingTemplate(id: MarketingTemplateId) {
    const instantiated = instantiateMarketingTemplate(id, brandKit);
    const nextTimeline = createEmptyTimeline();
    const firstTextOverlay =
      instantiated.project.overlays.find((overlay) => overlay.kind === "text") ?? null;

    setProject(instantiated.project);
    setCaptionStyle(instantiated.captionStyle);
    setMedia(null);
    setMediaItems([]);
    setDuration(0);
    setTimeline(nextTimeline);
    setAudioTrack(null);
    setCaptions(null);
    setStoryboard(null);
    setStoryboardBrief("");
    setGenerationLedger([]);
    setMarketingBrief(normalizeMarketingBrief(EMPTY_MARKETING_BRIEF));
    setCampaignVariants([]);
    setLanguageVariants([]);
    setCampaignExperiments([]);
    setReviewComments([]);
    setCommentDraft("");
    setApproval(initialApproval);
    setApprovalNote("");
    setMotionComponents([]);
    setMotionComponentName("");
    setPublishingHandoffs([]);
    setCaptionLanguage("auto");
    setCaptionState("idle");
    setSelectedCaptionId(null);
    setSelectedClipId(null);
    setSelectedId(firstTextOverlay?.id ?? null);
    setTimelineZoom(1);
    setSnapEnabled(true);
    setSilenceRanges([]);
    setSceneSuggestions([]);
    setSceneBackup(null);
    setSmartReframeState("idle");
    setSmartReframeAnchor(null);
    setSmartReframeError(null);
    undoStack.current = [];
    redoStack.current = [];

    void (async () => {
      try {
        setSaveState("saving");
        const savedAt = await savePhaseTwoDraft({
          project: instantiated.project,
          mediaItems: [],
          timeline: nextTimeline,
          audioTrack: null,
          captions: null,
          captionStyle: instantiated.captionStyle,
          brandKit,
          storyboard: null,
          generationLedger: [],
          marketingBrief: normalizeMarketingBrief(EMPTY_MARKETING_BRIEF),
          campaignVariants: [],
          languageVariants: [],
          campaignExperiments: [],
          timelineZoom: 1,
          snapEnabled: true,
          selectedClipId: null,
          selectedOverlayId: firstTextOverlay?.id ?? null,
          reviewComments: [],
          approval: initialApproval,
          motionComponents: [],
          publishingHandoffs: [],
        });
        setLastSavedAt(savedAt);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    })();
  }

  async function selectAIProvider(
    capability: ProviderCapability,
    providerId: string
  ) {
    try {
      setProviderState("saving");
      const response = await fetch("/api/providers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ capability, providerId }),
      });
      const payload = (await response.json()) as ProviderDirectorySnapshot & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to change AI provider.");
      }
      setProviderDirectory(payload);
      setProviderState("ready");
      setProviderError(null);
    } catch (error) {
      setProviderState("error");
      setProviderError(
        error instanceof Error ? error.message : "Unable to change AI provider."
      );
    }
  }

  function providerIdentity(capability: ProviderCapability) {
    const providerId = providerDirectory?.selections[capability] ?? "unknown";
    const descriptor = providerDirectory?.providers.find(
      (provider) => provider.id === providerId
    );
    const model = descriptor?.models[capability]?.[0] ?? "unknown";
    return { provider: providerId || "unknown", model };
  }

  function appendGenerationRecord(
    record: Omit<GenerationRecord, "id" | "createdAt" | "completedAt">
  ) {
    const now = Date.now();
    setGenerationLedger((current) =>
      [
        ...current,
        {
          ...record,
          id: crypto.randomUUID(),
          createdAt: now,
          completedAt: now,
        },
      ].slice(-100)
    );
  }

  function recordGenerationSuccess(
    capability: GenerationRecord["capability"],
    metadata: AssetGenerationMetadata,
    resultAssetId: string
  ) {
    appendGenerationRecord({
      capability,
      operation: metadata.operation,
      provider: metadata.provider,
      model: metadata.model,
      request: metadata.prompt,
      status: "succeeded",
      estimatedCost: metadata.estimatedCost,
      resultAssetId,
      sourceAssetId: metadata.sourceAssetId,
    });
  }

  function recordGenerationFailure(
    capability: ProviderCapability,
    operation: GenerationRecord["operation"],
    request: string,
    error: unknown
  ) {
    const identity = providerIdentity(capability);
    appendGenerationRecord({
      capability,
      operation,
      provider: identity.provider,
      model: identity.model,
      request,
      status: "failed",
      estimatedCost: null,
      error: error instanceof Error ? error.message : "Generation failed.",
    });
  }

  function reviewSelectedGeneratedAsset(reviewStatus: AssetReviewStatus) {
    if (!media?.generation) return;
    const generation = withDefaultProvenance({
      ...media.generation,
      reviewStatus,
    });
    setMediaItems((current) =>
      current.map((item) =>
        item.id === media.id ? { ...item, generation } : item
      )
    );
    setMedia((current) =>
      current?.id === media.id ? { ...current, generation } : current
    );
  }

  async function generateImageAsset(promptOverride?: string) {
    const prompt = (promptOverride ?? imagePrompt).trim();
    if (!prompt) {
      setImageGenerationState("error");
      setImageGenerationError("Write an image prompt first.");
      return;
    }

    try {
      setImageGenerationState("generating");
      setImageGenerationError(null);
      const response = await fetch("/api/generate/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          aspectRatio: project.ratio,
        }),
      });
      const payload = (await response.json()) as {
        artifact?: ProviderArtifact;
        prompt?: string;
        estimatedCost?: number | null;
        createdAt?: number;
        error?: string;
      };
      if (!response.ok || !payload.artifact) {
        throw new Error(payload.error || "Image generation failed.");
      }

      const artifact = payload.artifact;
      const assetResponse = await fetch(artifact.url);
      const blob = await assetResponse.blob();
      const normalizedBlob =
        blob.type === artifact.mimeType
          ? blob
          : blob.slice(0, blob.size, artifact.mimeType);
      const url = createObjectUrl(normalizedBlob);
      const item: MediaItem = {
        id: crypto.randomUUID(),
        kind: "image",
        url,
        name: `ai-${artifact.provider}-${Date.now()}.svg`,
        type: artifact.mimeType,
        blob: normalizedBlob,
        duration: 5,
        generation: withDefaultProvenance({
          provider: artifact.provider,
          model: artifact.model,
          prompt: payload.prompt ?? prompt,
          createdAt: payload.createdAt ?? Date.now(),
          estimatedCost: payload.estimatedCost ?? null,
          operation: "generate",
        }),
      };

      setMediaItems((current) => [...current, item]);
      setMedia(item);
      setDuration(0);
      if (item.generation) {
        recordGenerationSuccess("image", item.generation, item.id);
      }
      setImageGenerationState("idle");
    } catch (error) {
      recordGenerationFailure("image", "generate", prompt, error);
      setImageGenerationState("error");
      setImageGenerationError(
        error instanceof Error ? error.message : "Unable to generate image."
      );
    }
  }

  async function createImageVariant(
    operation: "edit" | "background" | "outpaint",
    prompt: string,
    aspectRatio?: RatioKey
  ) {
    const source = media?.kind === "image" ? media : null;
    if (!source) {
      setImageToolState("error");
      setImageToolError("Select an image asset first.");
      return;
    }

    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
      setImageToolState("error");
      setImageToolError("Write an edit instruction first.");
      return;
    }

    try {
      setImageToolState("working");
      setImageToolError(null);
      const imageUrl = await fileToDataUrl(source.blob);
      const response = await fetch("/api/generate/image/edit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: normalizedPrompt,
          imageUrl,
          aspectRatio,
          operation,
        }),
      });
      const payload = (await response.json()) as {
        artifact?: ProviderArtifact;
        prompt?: string;
        operation?: "edit" | "background" | "outpaint";
        requestedAspectRatio?: string | null;
        estimatedCost?: number | null;
        createdAt?: number;
        error?: string;
      };
      if (!response.ok || !payload.artifact) {
        throw new Error(payload.error || "Image edit failed.");
      }

      const artifact = payload.artifact;
      const assetResponse = await fetch(artifact.url);
      const blob = await assetResponse.blob();
      const normalizedBlob =
        blob.type === artifact.mimeType
          ? blob
          : blob.slice(0, blob.size, artifact.mimeType);
      const url = createObjectUrl(normalizedBlob);
      const extension =
        artifact.mimeType.includes("png")
          ? "png"
          : artifact.mimeType.includes("jpeg")
            ? "jpg"
            : artifact.mimeType.includes("webp")
              ? "webp"
              : "svg";
      const item: MediaItem = {
        id: crypto.randomUUID(),
        kind: "image",
        url,
        name: `ai-${operation}-${Date.now()}.${extension}`,
        type: artifact.mimeType,
        blob: normalizedBlob,
        duration: 5,
        generation: withDefaultProvenance({
          provider: artifact.provider,
          model: artifact.model,
          prompt: payload.prompt ?? normalizedPrompt,
          createdAt: payload.createdAt ?? Date.now(),
          estimatedCost: payload.estimatedCost ?? null,
          operation: payload.operation ?? operation,
          sourceAssetId: source.id,
          requestedAspectRatio: payload.requestedAspectRatio ?? aspectRatio,
        }),
      };

      setMediaItems((current) => [...current, item]);
      setMedia(item);
      setDuration(0);
      if (item.generation) {
        recordGenerationSuccess("image", item.generation, item.id);
      }
      setImageToolState("idle");
    } catch (error) {
      recordGenerationFailure("image", operation, normalizedPrompt, error);
      setImageToolState("error");
      setImageToolError(
        error instanceof Error ? error.message : "Unable to edit image."
      );
    }
  }

  async function generateVideoAsset(useSelectedImage: boolean) {
    const prompt = videoPrompt.trim();
    if (!prompt) {
      setVideoGenerationState("error");
      setVideoGenerationError("Write a video prompt first.");
      return;
    }

    if (useSelectedImage && media?.kind !== "image") {
      setVideoGenerationState("error");
      setVideoGenerationError("Select an image before image-to-video generation.");
      return;
    }

    try {
      setVideoGenerationState("generating");
      setVideoGenerationError(null);
      const sourceImage = useSelectedImage && media?.kind === "image" ? media : null;
      const imageUrl = sourceImage ? await fileToDataUrl(sourceImage.blob) : undefined;
      const response = await fetch("/api/generate/video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          imageUrl,
          durationSeconds: videoDurationSeconds,
          aspectRatio: project.ratio,
        }),
      });
      const payload = (await response.json()) as {
        artifact?: ProviderArtifact;
        prompt?: string;
        sourceMode?: "text-to-video" | "image-to-video";
        estimatedCost?: number | null;
        createdAt?: number;
        error?: string;
      };
      if (!response.ok || !payload.artifact) {
        throw new Error(payload.error || "Video generation failed.");
      }

      const artifact = payload.artifact;
      const assetResponse = await fetch(artifact.url);
      const blob = await assetResponse.blob();
      const normalizedBlob =
        blob.type === artifact.mimeType
          ? blob
          : blob.slice(0, blob.size, artifact.mimeType);
      const url = createObjectUrl(normalizedBlob);
      const detectedDuration = await probeMediaDuration(url, "video");
      const item: MediaItem = {
        id: crypto.randomUUID(),
        kind: "video",
        url,
        name: `ai-${payload.sourceMode ?? "video"}-${Date.now()}.webm`,
        type: artifact.mimeType,
        blob: normalizedBlob,
        duration: detectedDuration,
        generation: withDefaultProvenance({
          provider: artifact.provider,
          model: artifact.model,
          prompt: payload.prompt ?? prompt,
          createdAt: payload.createdAt ?? Date.now(),
          estimatedCost: payload.estimatedCost ?? null,
          operation: useSelectedImage ? "image_to_video" : "video_generate",
          sourceAssetId: sourceImage?.id,
          requestedAspectRatio: project.ratio,
          requestedDurationSeconds: videoDurationSeconds,
        }),
      };

      setMediaItems((current) => [...current, item]);
      setMedia(item);
      setDuration(detectedDuration);
      if (item.generation) {
        recordGenerationSuccess("video", item.generation, item.id);
      }
      setVideoGenerationState("idle");
    } catch (error) {
      recordGenerationFailure(
        "video",
        useSelectedImage ? "image_to_video" : "video_generate",
        prompt,
        error
      );
      setVideoGenerationState("error");
      setVideoGenerationError(
        error instanceof Error ? error.message : "Unable to generate video."
      );
    }
  }

  async function generateVoiceover() {
    const text = voiceText.trim();
    if (!text) {
      setVoiceGenerationState("error");
      setVoiceGenerationError("Write voiceover text first.");
      return;
    }

    try {
      setVoiceGenerationState("generating");
      setVoiceGenerationError(null);
      const response = await fetch("/api/generate/voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text,
          language: voiceLanguage,
          voice: "default",
        }),
      });
      const payload = (await response.json()) as {
        artifact?: ProviderArtifact;
        text?: string;
        voice?: string;
        language?: string;
        estimatedCost?: number | null;
        createdAt?: number;
        error?: string;
      };
      if (!response.ok || !payload.artifact) {
        throw new Error(payload.error || "Voice generation failed.");
      }

      const artifact = payload.artifact;
      const assetResponse = await fetch(artifact.url);
      const blob = await assetResponse.blob();
      const normalizedBlob =
        blob.type === artifact.mimeType
          ? blob
          : blob.slice(0, blob.size, artifact.mimeType);
      const url = createObjectUrl(normalizedBlob);
      const [audioDuration, measuredPeak] = await Promise.all([
        probeAudioDuration(url),
        measureAudioPeak(normalizedBlob),
      ]);
      const startTime =
        timeline.duration > 0
          ? Math.max(0, Math.min(timeline.playhead, timeline.duration - 0.1))
          : 0;
      const usableDuration =
        timeline.duration > 0
          ? Math.min(audioDuration, Math.max(0.1, timeline.duration - startTime))
          : audioDuration;

      const generatedAudio: AudioTrackItem = {
        id: crypto.randomUUID(),
        url,
        name: `ai-voiceover-${Date.now()}.wav`,
        type: artifact.mimeType,
        blob: normalizedBlob,
        duration: usableDuration,
        startTime,
        gain: 1,
        fadeIn: 0,
        fadeOut: 0,
        duckingEnabled: false,
        duckingGain: 0.3,
        role: "voiceover",
        normalizeEnabled: true,
        normalizeTarget: 0.85,
        measuredPeak,
        generation: withDefaultProvenance({
          provider: artifact.provider,
          model: artifact.model,
          prompt: payload.text ?? text,
          createdAt: payload.createdAt ?? Date.now(),
          estimatedCost: payload.estimatedCost ?? null,
          operation: "voice_synthesize",
          language: payload.language ?? voiceLanguage,
          voice: payload.voice ?? "default",
        }),
      };
      setAudioTrack(generatedAudio);
      if (generatedAudio.generation) {
        recordGenerationSuccess("voice", generatedAudio.generation, generatedAudio.id);
      }
      setVoiceGenerationState("idle");
    } catch (error) {
      recordGenerationFailure("voice", "voice_synthesize", text, error);
      setVoiceGenerationState("error");
      setVoiceGenerationError(
        error instanceof Error ? error.message : "Unable to generate voiceover."
      );
    }
  }

  function toggleBriefPlatform(platform: MarketingPlatform) {
    updateMarketingBrief({
      platforms: marketingBrief.platforms.includes(platform)
        ? marketingBrief.platforms.filter((item) => item !== platform)
        : [...marketingBrief.platforms, platform],
    });
  }

  function toggleBriefLanguage(language: MarketingLanguage) {
    updateMarketingBrief({
      languages: marketingBrief.languages.includes(language)
        ? marketingBrief.languages.filter((item) => item !== language)
        : [...marketingBrief.languages, language],
    });
  }

  function generateCreativeConceptsFromBrief() {
    const validation = validateMarketingBrief(marketingBrief);
    if (!validation.ready) return;
    const concepts = buildCreativeConcepts(marketingBrief);
    setCreativeConcepts(concepts);
    setSelectedConceptId(concepts[0]?.id ?? null);
  }

  async function orchestrateConceptToEdit(concept: CreativeConcept) {
    sendConceptToStoryboard(concept);

    const primaryPlatform = marketingBrief.platforms[0] ?? "instagram-reels";
    const targetRatio: RatioKey =
      primaryPlatform === "instagram-feed"
        ? "1:1"
        : primaryPlatform === "linkedin" || primaryPlatform === "x"
          ? "16:9"
          : "9:16";

    const timing = defaultOverlayTiming();
    const hookOverlay: TextOverlay = {
      id: crypto.randomUUID(),
      kind: "text",
      text: concept.hook,
      x: 50,
      y: 18,
      fontSize: 42,
      fontWeight: brandKit.headingWeight,
      fontFamily: brandKit.headingFont,
      color: brandKit.primaryColor,
      opacity: 1,
      align: "center",
      direction: marketingBrief.languages[0] === "ar" ? "rtl" : "ltr",
      ...timing,
    };
    const ctaOverlay: TextOverlay = {
      ...hookOverlay,
      id: crypto.randomUUID(),
      text: concept.cta,
      y: 82,
      fontSize: 30,
    };

    replaceProject((current) => ({
      ...current,
      ratio: targetRatio,
      overlays: [...current.overlays, hookOverlay, ctaOverlay],
    }));
    setSelectedId(hookOverlay.id);

    const firstScene = concept.scenes[0];
    if (firstScene) {
      setImagePrompt(firstScene.visualPrompt);
      await generateImageAsset(firstScene.visualPrompt);
    }
  }

  async function exportCampaignPack() {
    if (brandGuardian.status === "blocked") {
      setCampaignPackState("error");
      setCampaignPackError("Brand Guardian must pass before campaign export.");
      return;
    }

    try {
      setCampaignPackState("exporting");
      setCampaignPackError(null);
      const form = new FormData();
      const assets = mediaItems.map(({ url: _url, blob: _blob, ...item }) => item);
      const audio = audioTrack
        ? (({ url: _url, blob: _blob, ...track }) => track)(audioTrack)
        : null;

      form.set(
        "manifest",
        JSON.stringify({
          studio: "NEMDAR Creator",
          schemaVersion: 1,
          exportedAt: new Date().toISOString(),
          project,
          marketingBrief,
          brandKit,
          storyboard,
          captions,
          creativeConcepts,
          selectedConceptId,
          campaignVariants,
          languageVariants,
          campaignExperiments,
          generationLedger,
          assets,
          audioTrack: audio,
          preflight: brandGuardian,
        })
      );

      for (const item of mediaItems) {
        form.append(`asset:${item.id}`, item.blob, item.name);
      }
      if (audioTrack) {
        form.append(`asset:${audioTrack.id}`, audioTrack.blob, audioTrack.name);
      }

      const response = await fetch("/api/export/campaign-pack", {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Campaign Pack export failed.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename =
        disposition.match(/filename="([^"]+)"/)?.[1] ??
        `${project.name || "campaign"}-campaign-pack.zip`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setCampaignPackState("idle");
    } catch (error) {
      setCampaignPackState("error");
      setCampaignPackError(
        error instanceof Error ? error.message : "Unable to export Campaign Pack."
      );
    }
  }

  function selectedCreativeConcept() {
    return (
      creativeConcepts.find((item) => item.id === selectedConceptId) ??
      creativeConcepts[0] ??
      null
    );
  }

  async function onBatchCsvUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setBatchCsv(await file.text());
      setBatchError(null);
      setBatchState("idle");
    } catch {
      setBatchState("error");
      setBatchError("Unable to read CSV file.");
    } finally {
      event.target.value = "";
    }
  }

  async function runBatchGeneration() {
    const rows = parseBatchCsv(batchCsv);
    if (!rows.length) {
      setBatchState("error");
      setBatchError("CSV needs a header row and at least one data row.");
      return;
    }

    try {
      setBatchState("generating");
      setBatchError(null);
      const response = await fetch("/api/batch/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rows,
          defaultTemplate: batchTemplate,
          brandKit,
        }),
      });
      const payload = (await response.json()) as BatchGenerationResult & {
        error?: string;
      };
      if (!response.ok || !Array.isArray(payload.variants)) {
        throw new Error(payload.error || "Batch generation failed.");
      }
      setBatchResult(payload);
      setBatchState("ready");
    } catch (error) {
      setBatchState("error");
      setBatchError(
        error instanceof Error ? error.message : "Unable to generate batch."
      );
    }
  }

  async function createPublishingHandoffFromProject() {
    if (approval.status !== "approved") {
      setPublishingState("error");
      setPublishingError("Approve the project before publishing handoff.");
      return;
    }
    if (!publishingConnectorId) {
      setPublishingState("error");
      setPublishingError("Select a publishing connector.");
      return;
    }

    try {
      setPublishingState("loading");
      setPublishingError(null);
      const response = await fetch("/api/publishing/handoff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          connectorId: publishingConnectorId,
          workspaceId: publishingWorkspaceId,
          accountId: publishingAccountId,
          projectName: project.name,
          caption: publishingCaption,
          assetName: media?.name ?? null,
          scheduledAt: publishingSchedule || null,
          approved: true,
        }),
      });
      const payload = (await response.json()) as PublishingHandoff & {
        error?: string;
      };
      if (!response.ok || !payload.id) {
        throw new Error(payload.error || "Publishing handoff failed.");
      }

      setPublishingHandoffs((current) =>
        [payload, ...current].sort((a, b) => {
          const aTime = a.scheduledAt
            ? new Date(a.scheduledAt).getTime()
            : a.createdAt;
          const bTime = b.scheduledAt
            ? new Date(b.scheduledAt).getTime()
            : b.createdAt;
          return aTime - bTime;
        })
      );
      setPublishingState("ready");
    } catch (error) {
      setPublishingState("error");
      setPublishingError(
        error instanceof Error
          ? error.message
          : "Unable to create publishing handoff."
      );
    }
  }

  function loadBatchVariant(index: number) {
    const variant = batchResult?.variants[index];
    if (!variant?.project) return;

    const nextProject = structuredClone(variant.project);
    setProject(nextProject);
    setSelectedId(nextProject.overlays[0]?.id ?? null);
    setMediaItems([]);
    setMedia(null);
    setDuration(0);
    setTimeline(createEmptyTimeline());
    setAudioTrack(null);
    setCaptions(null);
    setStoryboard(null);
    setStoryboardBrief("");
  }

  function generateLanguageCampaignVariants() {
    const concept = selectedCreativeConcept();
    if (!concept) return;
    setLanguageVariants(buildLanguageVariants(concept, marketingBrief));
  }

  function applyLanguageVariant(variant: CampaignLanguageVariant) {
    const concept = selectedCreativeConcept();
    if (!concept) return;

    let hookApplied = false;
    let ctaApplied = false;
    replaceProject((current) => ({
      ...current,
      name: `${current.name} — ${variant.language.toUpperCase()}`,
      overlays: current.overlays.map((overlay) => {
        if (overlay.kind !== "text") return overlay;
        if (!hookApplied && (overlay.text === concept.hook || overlay.y < 50)) {
          hookApplied = true;
          return {
            ...overlay,
            text: variant.hook,
            direction: variant.direction,
            align: "center",
          };
        }
        if (!ctaApplied && (overlay.text === concept.cta || overlay.y >= 50)) {
          ctaApplied = true;
          return {
            ...overlay,
            text: variant.cta,
            direction: variant.direction,
            align: "center",
          };
        }
        return overlay;
      }),
    }));
  }

  function generateCampaignExperiments() {
    const concept = selectedCreativeConcept();
    if (!concept) return;
    setCampaignExperiments(buildBoundedExperiments(concept));
  }

  function applyCampaignExperiment(experiment: CampaignExperiment) {
    const concept = selectedCreativeConcept();
    if (!concept) return;

    setCreativeConcepts((items) =>
      items.map((item) =>
        item.id === concept.id
          ? { ...item, hook: experiment.hook, cta: experiment.cta }
          : item
      )
    );

    replaceProject((current) => ({
      ...current,
      overlays: current.overlays.map((overlay) => {
        if (overlay.kind !== "text") return overlay;
        if (overlay.text === concept.hook) return { ...overlay, text: experiment.hook };
        if (overlay.text === concept.cta) return { ...overlay, text: experiment.cta };
        return overlay;
      }),
    }));
  }

  function generatePlatformVariants() {
    const concept =
      creativeConcepts.find((item) => item.id === selectedConceptId) ??
      creativeConcepts[0] ??
      null;
    const variants = buildCampaignVariants(project, concept);
    setCampaignVariants(variants);
  }

  function loadCampaignVariant(variant: CampaignVariant) {
    setProject(structuredClone(variant.project));
    setSelectedId(variant.project.overlays.find((overlay) => overlay.kind === "text")?.id ?? null);
  }

  function sendConceptToStoryboard(concept: CreativeConcept) {
    setSelectedConceptId(concept.id);
    setStoryboardBrief(concept.script);
    setStoryboard({
      provider: "nemdar-marketing-studio",
      model: "concept-scene-plan-v1",
      brief: concept.script,
      generatedAt: Date.now(),
      scenes: concept.scenes.map((scene) => ({
        id: `marketing-scene-${scene.order}-${crypto.randomUUID()}`,
        order: scene.order,
        title: `Scene ${scene.order}`,
        narration: scene.narration,
        visualPrompt: scene.visualPrompt,
        duration: scene.duration,
        assetNeed: scene.order === 1 ? "generate-video" : "b-roll",
        broll: [],
      })),
    });
  }

  function updateMarketingBrief(patch: Partial<MarketingBrief>) {
    setMarketingBrief((current) =>
      normalizeMarketingBrief({
        ...current,
        ...patch,
        updatedAt: Date.now(),
      })
    );
  }

  function toggleMarketingPlatform(platform: MarketingPlatform) {
    setMarketingBrief((current) => {
      const has = current.platforms.includes(platform);
      const platforms = has
        ? current.platforms.filter((item) => item !== platform)
        : [...current.platforms, platform];
      return normalizeMarketingBrief({
        ...current,
        platforms,
        updatedAt: Date.now(),
      });
    });
  }

  function toggleMarketingLanguage(language: MarketingLanguage) {
    setMarketingBrief((current) => {
      const has = current.languages.includes(language);
      const languages = has
        ? current.languages.filter((item) => item !== language)
        : [...current.languages, language];
      return normalizeMarketingBrief({
        ...current,
        languages,
        updatedAt: Date.now(),
      });
    });
  }

  function splitBriefLines(value: string) {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  async function generateStoryboardPlan() {
    const brief = storyboardBrief.trim();
    if (!brief) {
      setStoryboardState("error");
      setStoryboardError("Write a campaign brief or script first.");
      return;
    }

    try {
      setStoryboardState("generating");
      setStoryboardError(null);
      const response = await fetch("/api/generate/storyboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief }),
      });
      const payload = (await response.json()) as StoryboardPlan & { error?: string };
      if (!response.ok || !payload.scenes?.length) {
        throw new Error(payload.error || "Storyboard generation failed.");
      }
      setStoryboard(payload);
      setStoryboardState("idle");
    } catch (error) {
      setStoryboardState("error");
      setStoryboardError(
        error instanceof Error ? error.message : "Unable to generate storyboard."
      );
    }
  }

  async function suggestStoryboardBroll() {
    if (!storyboard) return;

    try {
      setStoryboardState("generating");
      setStoryboardError(null);
      const response = await fetch("/api/generate/broll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plan: storyboard,
          assets: mediaItems.map((item) => ({
            name: item.name,
            kind: item.kind,
          })),
        }),
      });
      const payload = (await response.json()) as StoryboardPlan & { error?: string };
      if (!response.ok || !payload.scenes?.length) {
        throw new Error(payload.error || "B-roll suggestion failed.");
      }
      setStoryboard(payload);
      setStoryboardState("idle");
    } catch (error) {
      setStoryboardState("error");
      setStoryboardError(
        error instanceof Error ? error.message : "Unable to suggest B-roll."
      );
    }
  }

  function updateStoryboardScene(
    id: string,
    patch: Partial<StoryboardScene>
  ) {
    setStoryboard((current) =>
      current
        ? {
            ...current,
            scenes: current.scenes.map((scene) =>
              scene.id === id ? { ...scene, ...patch } : scene
            ),
          }
        : current
    );
  }

  function useBrollOption(option: BrollOption) {
    if (option.kind === "existing" && option.assetName) {
      const item = mediaItems.find((asset) => asset.name === option.assetName);
      if (item) selectMediaItem(item);
      return;
    }

    if (option.kind === "generate-image") {
      setImagePrompt(option.prompt);
      return;
    }

    setVideoPrompt(option.prompt);
  }

  function previewEditorCommand() {
    const result = compileEditorCommand(commandInput, {
      selectedOverlayId: selectedId,
    });
    setCommandPlan(result.plan);
    setCommandError(result.error);
  }

  function applyEditorCommandPlan() {
    if (!commandPlan) return;

    for (const action of commandPlan.actions) {
      if (
        action.type === "delete_selected_overlay" &&
        !project.overlays.some((overlay) => overlay.id === action.overlayId)
      ) {
        setCommandPlan(null);
        setCommandError("The selected overlay changed. Preview the command again.");
        return;
      }
    }

    let lastAddedId: string | null = null;
    let deletedSelected = false;

    replaceProject((current) => {
      let next: CreatorProject = {
        ...current,
        overlays: [...current.overlays],
      };

      for (const action of commandPlan.actions) {
        switch (action.type) {
          case "set_ratio":
            next = { ...next, ratio: action.ratio };
            break;
          case "set_muted":
            next = { ...next, muted: action.muted };
            break;
          case "rename_project":
            next = { ...next, name: action.name };
            break;
          case "add_text": {
            const id = crypto.randomUUID();
            lastAddedId = id;
            next = {
              ...next,
              overlays: [
                ...next.overlays,
                {
                  id,
                  kind: "text",
                  text: action.text,
                  x: 50,
                  y: 22,
                  fontSize: 44,
                  fontWeight: brandKit.headingWeight,
                  fontFamily: brandKit.headingFont,
                  color: brandKit.primaryColor,
                  opacity: 1,
                  align: "center",
                  direction: /[\u0600-\u06FF]/.test(action.text) ? "rtl" : "ltr",
                  ...defaultOverlayTiming(),
                },
              ],
            };
            break;
          }
          case "delete_selected_overlay":
            next = {
              ...next,
              overlays: next.overlays.filter(
                (overlay) => overlay.id !== action.overlayId
              ),
            };
            if (selectedId === action.overlayId) deletedSelected = true;
            break;
        }
      }

      return next;
    });

    if (lastAddedId) setSelectedId(lastAddedId);
    else if (deletedSelected) setSelectedId(null);

    setCommandPlan(null);
    setCommandError(null);
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

  function updateSelectedClipChroma(
    patch: Partial<ClipChromaKey>
  ) {
    if (!selectedClip) return;
    setTimeline((current) =>
      updateTimelineClipChroma(current, selectedClip.id, patch)
    );
  }

  function updateSelectedClipColorGrade(
    patch: Partial<TimelineClip["colorGrade"]>
  ) {
    if (!selectedClip) return;
    setTimeline((current) =>
      updateTimelineClipColorGrade(current, selectedClip.id, patch)
    );
  }

  function moveMediaItem(id: string, direction: -1 | 1) {
    const index = mediaItems.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= mediaItems.length) return;

    setMediaItems((current) => {
      const currentIndex = current.findIndex((item) => item.id === id);
      const currentTarget = currentIndex + direction;
      if (
        currentIndex < 0 ||
        currentTarget < 0 ||
        currentTarget >= current.length
      ) {
        return current;
      }
      const next = [...current];
      [next[currentIndex], next[currentTarget]] = [
        next[currentTarget],
        next[currentIndex],
      ];
      return next;
    });

    setTimeline((current) => {
      const clips =
        current.tracks[0]?.clips.filter((clip) => clip.assetId === id) ?? [];
      if (clips.length !== 1) return current;
      return moveTimelineClip(current, clips[0].id, direction);
    });
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
      fontFamily: brandKit.headingFont,
      color: brandKit.primaryColor,
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

  function addSelectedOverlayKeyframe() {
    if (!selected) return;
    const keyframe = createOverlayKeyframe(selected, timeline.playhead);
    replaceProject((current) => ({
      ...current,
      overlays: current.overlays.map((overlay) =>
        overlay.id === selected.id
          ? upsertOverlayKeyframe(overlay, keyframe)
          : overlay
      ),
    }));
    setSelectedKeyframeId(keyframe.id);
  }

  function updateSelectedOverlayKeyframe(
    patch: Partial<OverlayKeyframe>,
    valuePatch?: Partial<OverlayKeyframe["value"]>
  ) {
    if (!selected || !selectedKeyframe) return;
    const next: OverlayKeyframe = {
      ...selectedKeyframe,
      ...patch,
      time: Math.max(0, Math.min(timeline.duration, patch.time ?? selectedKeyframe.time)),
      value: {
        ...selectedKeyframe.value,
        ...(valuePatch ?? {}),
      },
    };
    replaceProject((current) => ({
      ...current,
      overlays: current.overlays.map((overlay) =>
        overlay.id === selected.id
          ? upsertOverlayKeyframe(overlay, next)
          : overlay
      ),
    }));
  }

  function removeSelectedOverlayKeyframe() {
    if (!selected || !selectedKeyframe) return;
    const keyframeId = selectedKeyframe.id;
    replaceProject((current) => ({
      ...current,
      overlays: current.overlays.map((overlay) =>
        overlay.id === selected.id
          ? deleteOverlayKeyframe(overlay, keyframeId)
          : overlay
      ),
    }));
    setSelectedKeyframeId(null);
  }

  function applySelectedMotionPreset(presetId: MotionPresetId) {
    if (!selected) return;
    const startTime = getOverlayStart(selected);
    const rawEnd = getOverlayEnd(selected);
    const endTime = Number.isFinite(rawEnd)
      ? Math.min(rawEnd, timeline.duration || rawEnd)
      : Math.max(startTime + 2, timeline.duration || startTime + 2);
    const nextSelected = applyMotionPreset(
      selected,
      presetId,
      startTime,
      endTime
    );

    replaceProject((current) => ({
      ...current,
      overlays: current.overlays.map((overlay) =>
        overlay.id === selected.id ? nextSelected : overlay
      ),
    }));
    setSelectedKeyframeId(nextSelected.keyframes?.[0]?.id ?? null);
  }

  function saveSelectedMotionComponent() {
    if (!selected) return;
    const component = captureMotionComponent(selected, motionComponentName);
    if (!component) return;

    setMotionComponents((current) => [component, ...current]);
    setMotionComponentName("");
  }

  function applySavedMotionComponent(component: MotionComponent) {
    if (!selected) return;
    const startTime = getOverlayStart(selected);
    const rawEnd = getOverlayEnd(selected);
    const endTime = Number.isFinite(rawEnd)
      ? Math.min(rawEnd, timeline.duration || rawEnd)
      : Math.max(startTime + component.sourceDuration, timeline.duration || startTime + component.sourceDuration);
    const nextSelected = applyMotionComponent(
      selected,
      component,
      startTime,
      endTime
    );

    replaceProject((current) => ({
      ...current,
      overlays: current.overlays.map((overlay) =>
        overlay.id === selected.id ? nextSelected : overlay
      ),
    }));
    setSelectedKeyframeId(nextSelected.keyframes?.[0]?.id ?? null);
  }

  function deleteMotionComponent(componentId: string) {
    setMotionComponents((current) =>
      current.filter((component) => component.id !== componentId)
    );
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
        const timing = Number.isFinite(end)
          ? [getOverlayStart(overlay), Math.min(end, timeline.duration)]
          : [getOverlayStart(overlay)];
        return [
          ...timing,
          ...(overlay.keyframes ?? []).map((keyframe) =>
            Math.max(0, Math.min(timeline.duration, keyframe.time))
          ),
        ];
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
      mediaItems: mediaItems.map(({ url: _url, proxyUrl: _proxyUrl, ...item }) => item),
      timeline,
      audioTrack: audioTrack
        ? (({ url: _url, ...track }) => track)(audioTrack)
        : null,
      captions,
      captionStyle,
      brandKit,
      storyboard,
      generationLedger,
      marketingBrief,
      campaignVariants,
      languageVariants,
      campaignExperiments,
      timelineZoom,
      snapEnabled,
      selectedClipId,
      selectedOverlayId: selectedId,
      reviewComments,
      approval,
      motionComponents,
      publishingHandoffs,
    };
  }

  async function refreshSnapshots() {
    const nextSnapshots = await listPhaseTwoSnapshots();
    setSnapshots(nextSnapshots);
  }

  function markApproval(status: ApprovalStatus) {
    const openCommentCount = reviewComments.filter((comment) => !comment.resolved).length;
    if (status === "approved" && openCommentCount > 0) return;

    setApproval({
      status,
      updatedAt: Date.now(),
      note: approvalNote.trim(),
    });
    setApprovalNote("");
  }

  function invalidateApprovedProject(note: string) {
    setApproval((current) =>
      current.status === "approved"
        ? { status: "changes_requested", updatedAt: Date.now(), note }
        : current
    );
  }

  function addReviewComment() {
    const body = commentDraft.trim();
    if (!body) return;

    const timelineTime = Math.max(
      0,
      Math.min(timeline.playhead, Math.max(0, timeline.duration))
    );
    setReviewComments((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        body,
        createdAt: Date.now(),
        timelineTime,
        resolved: false,
      },
    ]);
    invalidateApprovedProject("A new review comment was opened after approval.");
    setCommentDraft("");
  }

  function toggleReviewComment(commentId: string) {
    const target = reviewComments.find((comment) => comment.id === commentId);
    if (target?.resolved) {
      invalidateApprovedProject("A resolved review comment was reopened after approval.");
    }
    setReviewComments((current) =>
      current.map((comment) =>
        comment.id === commentId
          ? { ...comment, resolved: !comment.resolved }
          : comment
      )
    );
  }

  function restorePhaseTwoState(state: HydratedPhaseTwoState) {
    const restoredMediaItems: MediaItem[] = state.mediaItems.map((item) => ({
      ...item,
      generation: item.generation
        ? withDefaultProvenance(item.generation)
        : undefined,
      url: createObjectUrl(item.blob),
      proxyUrl: item.proxyBlob ? createObjectUrl(item.proxyBlob) : undefined,
      proxyType: item.proxyType ?? item.proxyBlob?.type,
    }));
    const restoredAudio: AudioTrackItem | null = state.audioTrack
      ? {
          ...state.audioTrack,
          duckingEnabled: state.audioTrack.duckingEnabled ?? false,
          duckingGain: state.audioTrack.duckingGain ?? 0.3,
          role:
            state.audioTrack.role === "voiceover" || state.audioTrack.role === "sfx"
              ? state.audioTrack.role
              : "music",
          normalizeEnabled: state.audioTrack.normalizeEnabled ?? false,
          normalizeTarget: state.audioTrack.normalizeTarget ?? 0.85,
          measuredPeak: state.audioTrack.measuredPeak ?? null,
          generation: state.audioTrack.generation
            ? withDefaultProvenance(state.audioTrack.generation)
            : undefined,
          url: createObjectUrl(state.audioTrack.blob),
        }
      : null;

    setProject({ ...initialProject, ...state.project });
    setMediaItems(restoredMediaItems);
    setTimeline(state.timeline);
    setAudioTrack(restoredAudio);
    setCaptions(state.captions ?? null);
    setCaptionStyle(normalizeCaptionStyle(state.captionStyle));
    setBrandKit(normalizeBrandKit(state.brandKit));
    setStoryboard(state.storyboard ?? null);
    setStoryboardBrief(state.storyboard?.brief ?? "");
    setGenerationLedger(state.generationLedger ?? []);
    setMarketingBrief(normalizeMarketingBrief(state.marketingBrief));
    setCampaignVariants(state.campaignVariants ?? []);
    setLanguageVariants(state.languageVariants ?? []);
    setCampaignExperiments(state.campaignExperiments ?? []);
    setCaptionLanguage(state.captions?.requestedLanguage ?? "auto");
    setCaptionState(state.captions?.cues.length ? "ready" : "idle");
    setSelectedCaptionId(state.captions?.cues[0]?.id ?? null);
    setTimelineZoom(state.timelineZoom ?? 1);
    setSnapEnabled(state.snapEnabled ?? true);
    setReviewComments(state.reviewComments ?? []);
    setCommentDraft("");
    setApproval(state.approval ?? initialApproval);
    setApprovalNote("");
    setMotionComponents(state.motionComponents ?? []);
    setMotionComponentName("");
    setPublishingHandoffs(state.publishingHandoffs ?? []);

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
      brandKit: normalizeBrandKit(state.brandKit),
      storyboard: state.storyboard ?? null,
      generationLedger: state.generationLedger ?? [],
      marketingBrief: normalizeMarketingBrief(state.marketingBrief),
      campaignVariants: state.campaignVariants ?? [],
      languageVariants: state.languageVariants ?? [],
      campaignExperiments: state.campaignExperiments ?? [],
      timelineZoom: state.timelineZoom,
      snapEnabled: state.snapEnabled,
      selectedClipId: state.selectedClipId,
      selectedOverlayId: state.selectedOverlayId,
      reviewComments: state.reviewComments ?? [],
      approval: state.approval ?? initialApproval,
      motionComponents: state.motionComponents ?? [],
      publishingHandoffs: state.publishingHandoffs ?? [],
    };
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [draft, storedSnapshots, storedBrandKit] = await Promise.all([
          loadPhaseTwoDraft(),
          listPhaseTwoSnapshots(),
          loadBrandKit(),
        ]);
        if (cancelled) return;

        setSnapshots(storedSnapshots);
        if (draft) {
          restorePhaseTwoState(draft);
          lastAutoSnapshotAtRef.current = draft.savedAt;
        }
        if (storedBrandKit) {
          setBrandKit(normalizeBrandKit(storedBrandKit));
          setBrandState("saved");
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

    if (brandAutosaveTimerRef.current !== null) {
      window.clearTimeout(brandAutosaveTimerRef.current);
    }

    setBrandState("saving");
    brandAutosaveTimerRef.current = window.setTimeout(() => {
      void saveBrandKit(brandKit)
        .then(() => setBrandState("saved"))
        .catch(() => setBrandState("error"));
    }, 450);

    return () => {
      if (brandAutosaveTimerRef.current !== null) {
        window.clearTimeout(brandAutosaveTimerRef.current);
        brandAutosaveTimerRef.current = null;
      }
    };
  }, [storageHydrated, brandKit]);

  useEffect(() => {
    if (!storageHydrated) return;

    const hasMeaningfulState =
      mediaItems.length > 0 ||
      project.overlays.length > 0 ||
      audioTrack !== null ||
      captions !== null ||
      storyboard !== null ||
      generationLedger.length > 0 ||
      campaignVariants.length > 0 ||
      languageVariants.length > 0 ||
      campaignExperiments.length > 0 ||
      reviewComments.length > 0 ||
      motionComponents.length > 0 ||
      publishingHandoffs.length > 0 ||
      Boolean(marketingBrief.product || marketingBrief.audience || marketingBrief.objective || marketingBrief.cta);
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
    timeline.playhead,
    audioTrack,
    captions,
    captionStyle,
    brandKit,
    storyboard,
    generationLedger,
    marketingBrief,
    campaignVariants,
    languageVariants,
    campaignExperiments,
    reviewComments,
    approval,
    motionComponents,
    publishingHandoffs,
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
      const animated = resolveOverlayAnimation(overlay, timeline.playhead);
      if (overlay.kind === "text") {
        ctx.save();
        ctx.translate((animated.x / 100) * canvas.width, (animated.y / 100) * canvas.height);
        ctx.rotate((animated.rotation * Math.PI) / 180);
        ctx.scale(animated.scale, animated.scale);
        ctx.globalCompositeOperation = canvasCompositeOperation(overlay.blendMode);
        ctx.globalAlpha = animated.opacity;
        ctx.fillStyle = overlay.color;
        ctx.font = `${overlay.fontWeight} ${overlay.fontSize * (canvas.width / 720)}px ${overlay.fontFamily ?? "Arial, sans-serif"}`;
        ctx.textAlign = overlay.align;
        ctx.direction = overlay.direction;
        ctx.fillText(overlay.text, 0, 0);
        ctx.restore();
      } else {
        const image = new Image();
        image.src = overlay.src;
        await image.decode();
        const width = (overlay.width / 100) * canvas.width;
        const height = width * (image.naturalHeight / image.naturalWidth);
        ctx.save();
        ctx.translate((animated.x / 100) * canvas.width, (animated.y / 100) * canvas.height);
        ctx.rotate((animated.rotation * Math.PI) / 180);
        ctx.scale(animated.scale, animated.scale);
        clipCanvasOverlayMask(ctx, overlay, width, height, true);
        ctx.globalCompositeOperation = canvasCompositeOperation(overlay.blendMode);
        ctx.globalAlpha = animated.opacity;
        ctx.drawImage(image, -width / 2, -height / 2, width, height);
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
      const animated = resolveOverlayAnimation(overlay, timelineTime);
      if (overlay.kind === "text") {
        ctx.save();
        ctx.translate((animated.x / 100) * width, (animated.y / 100) * height);
        ctx.rotate((animated.rotation * Math.PI) / 180);
        ctx.scale(animated.scale, animated.scale);
        ctx.globalCompositeOperation = canvasCompositeOperation(overlay.blendMode);
        ctx.globalAlpha = animated.opacity;
        ctx.fillStyle = overlay.color;
        ctx.font = `${overlay.fontWeight} ${overlay.fontSize * (width / 720)}px ${overlay.fontFamily ?? "Arial, sans-serif"}`;
        ctx.textAlign = overlay.align;
        ctx.direction = overlay.direction;
        ctx.fillText(overlay.text, 0, 0);
        ctx.restore();
        continue;
      }

      const image = overlayImages.get(overlay.id);
      if (!image) continue;
      const renderedWidth = (overlay.width / 100) * width;
      const renderedHeight = renderedWidth * (image.naturalHeight / image.naturalWidth);
      ctx.save();
      ctx.translate((animated.x / 100) * width, (animated.y / 100) * height);
      ctx.rotate((animated.rotation * Math.PI) / 180);
      ctx.scale(animated.scale, animated.scale);
      clipCanvasOverlayMask(ctx, overlay, renderedWidth, renderedHeight, true);
      ctx.globalCompositeOperation = canvasCompositeOperation(overlay.blendMode);
      ctx.globalAlpha = animated.opacity;
      ctx.drawImage(
        image,
        -renderedWidth / 2,
        -renderedHeight / 2,
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

    const canvasStream = canvas.captureStream(0);
    const canvasVideoTrack = canvasStream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
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
      canvasVideoTrack?.requestFrame?.();
      recorder.start(50);
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
              canvasVideoTrack?.requestFrame?.();
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
    const chroma = normalizeClipChroma(clip?.chroma);
    const colorFilter = clipColorFilter(clip);

    const keyedCanvas = chroma.enabled ? document.createElement("canvas") : null;
    const targetCtx = keyedCanvas?.getContext("2d") ?? ctx;
    if (keyedCanvas) {
      keyedCanvas.width = Math.max(1, Math.round(w));
      keyedCanvas.height = Math.max(1, Math.round(h));
    }

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

    targetCtx.save();
    if (!chroma.enabled) targetCtx.filter = colorFilter;
    targetCtx.translate(w / 2, h / 2);
    targetCtx.rotate(rotation);
    targetCtx.drawImage(source, dx - w / 2, dy - h / 2, dw, dh);
    targetCtx.restore();

    if (keyedCanvas && targetCtx !== ctx) {
      applyChromaKeyPixels(targetCtx, keyedCanvas.width, keyedCanvas.height, chroma);
      ctx.save();
      ctx.fillStyle = chroma.backgroundColor;
      ctx.fillRect(0, 0, w, h);
      ctx.filter = colorFilter;
      ctx.drawImage(keyedCanvas, 0, 0, w, h);
      ctx.restore();
    }
  }

  const ratio = RATIOS[project.ratio];

  return (
    <main className="appShell">
      <header className="topbar">
        <div className="brandCluster">
          <span className="brandGlyph" aria-hidden="true">N</span>
          <span className="brandCopy">
            <span className="eyebrow">NEMDAR</span>
            <strong>Creative Studio</strong>
          </span>
          <span className="phaseChip projectChip">{project.name}</span>
          <span className={`phaseChip saveTop ${saveState}`}>
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save error" : "Local draft"}
          </span>
          <span className={`phaseChip approvalTop ${approval.status}`}>{approval.status}</span>
          <nav className="viewTabs" data-testid="p8-workspace-tabs" aria-label="Creative workspace">
            {([
              ["editor", "Edit"],
              ["campaign", "Campaign"],
              ["batch", "Batch"],
              ["publishing", "Publish"],
            ] as Array<[WorkspaceView, string]>).map(([view, label]) => (
              <button
                type="button"
                key={view}
                className={workspaceView === view ? "viewTab active" : "viewTab"}
                aria-pressed={workspaceView === view}
                onClick={() => setWorkspaceView(view)}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
        <div className="topActions">
          <button className="ghost" onClick={undo}>Undo</button>
          <button className="ghost" onClick={redo}>Redo</button>
          <button className="ghost" onClick={loadDraft} disabled={!storageHydrated}>Load draft</button>
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

      <section className={workspaceView === "editor" ? "commandBar" : "commandBar commandBarHidden"} data-testid="command-bar">
        <div className="commandBarInput">
          <span className="commandSpark" aria-hidden="true">✦</span>
          <input
            aria-label="AI edit command"
            value={commandInput}
            placeholder="Ask The Wand to reframe, add text, mute, or prepare an edit…"
            onChange={(e) => {
              setCommandInput(e.target.value);
              setCommandPlan(null);
              setCommandError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") previewEditorCommand();
            }}
          />
          <button type="button" className="ghost" aria-label="Preview command" onClick={previewEditorCommand}>
            Plan edit
          </button>
        </div>
        <div className="commandExamples">
          <span>Examples:</span>
          <button type="button" onClick={() => setCommandInput("set ratio to 4:5; add text: Limited offer")}>
            Ratio + text
          </button>
          <button type="button" onClick={() => setCommandInput("أضف نص: عرض خاص")}>
            Arabic text
          </button>
          <button type="button" onClick={() => setCommandInput("mute video")}>
            Mute
          </button>
        </div>
        {commandError && <p className="commandError" role="alert">{commandError}</p>}
        {commandPlan && (
          <div className="commandPlan" data-testid="command-plan">
            <div>
              <strong>Validated action plan</strong>
              <small>No edits are applied until you confirm.</small>
            </div>
            <ol>
              {commandPlan.summary.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ol>
            <button type="button" className="primary" onClick={applyEditorCommandPlan}>
              Apply actions
            </button>
          </div>
        )}
      </section>

      {workspaceView === "campaign" && (
      <section className="marketingStudio" data-testid="marketing-brief">
        <div className="marketingStudioHeader">
          <div>
            <span className="eyebrow">P5 Marketing Studio</span>
            <strong>Brief → Concepts → Script → Scene plan</strong>
          </div>
          <span className={validateMarketingBrief(marketingBrief).ready ? "briefReady" : "briefDraft"}>
            {validateMarketingBrief(marketingBrief).ready ? "Ready for concepts" : "Brief incomplete"}
          </span>
        </div>
        <div className="marketingBriefGrid">
          <label>Product<input aria-label="Brief product" value={marketingBrief.product} onChange={(e)=>updateMarketingBrief({product:e.target.value})}/></label>
          <label>Audience<input aria-label="Brief audience" value={marketingBrief.audience} onChange={(e)=>updateMarketingBrief({audience:e.target.value})}/></label>
          <label>Objective<input aria-label="Brief objective" value={marketingBrief.objective} onChange={(e)=>updateMarketingBrief({objective:e.target.value})}/></label>
          <label>Offer<input aria-label="Brief offer" value={marketingBrief.offer} onChange={(e)=>updateMarketingBrief({offer:e.target.value})}/></label>
          <label>Tone<input aria-label="Brief tone" value={marketingBrief.tone} onChange={(e)=>updateMarketingBrief({tone:e.target.value})}/></label>
          <label>CTA<input aria-label="Brief CTA" value={marketingBrief.cta} onChange={(e)=>updateMarketingBrief({cta:e.target.value})}/></label>
        </div>
        <div className="briefChoiceRow">
          {(["instagram-reels","instagram-feed","tiktok","youtube-shorts","linkedin","x","snapchat"] as MarketingPlatform[]).map((platform)=>(
            <button type="button" key={platform} className={marketingBrief.platforms.includes(platform)?"active":""} onClick={()=>toggleBriefPlatform(platform)}>{platform}</button>
          ))}
        </div>
        <div className="briefChoiceRow">
          {(["ar","en"] as MarketingLanguage[]).map((language)=>(
            <button type="button" key={language} className={marketingBrief.languages.includes(language)?"active":""} onClick={()=>toggleBriefLanguage(language)}>{language.toUpperCase()}</button>
          ))}
        </div>
        <div className="marketingBriefGrid marketingBriefTextareas">
          <label>Approved claims<textarea aria-label="Brief approved claims" value={marketingBrief.requiredClaims.join("\n")} onChange={(e)=>updateMarketingBrief({requiredClaims:e.target.value.split("\n")})}/></label>
          <label>Never claim<textarea aria-label="Brief prohibited claims" value={marketingBrief.prohibitedClaims.join("\n")} onChange={(e)=>updateMarketingBrief({prohibitedClaims:e.target.value.split("\n")})}/></label>
          <label>Constraints<textarea aria-label="Brief constraints" value={marketingBrief.constraints} onChange={(e)=>updateMarketingBrief({constraints:e.target.value})}/></label>
        </div>
        {!validateMarketingBrief(marketingBrief).ready && (
          <p className="hint" data-testid="brief-missing">Missing: {validateMarketingBrief(marketingBrief).missing.join(", ")}</p>
        )}
        <button type="button" className="primary" disabled={!validateMarketingBrief(marketingBrief).ready} onClick={generateCreativeConceptsFromBrief}>Generate concepts</button>
        {creativeConcepts.length > 0 && (
          <div className="conceptGrid" data-testid="concept-grid">
            {creativeConcepts.map((concept)=>(
              <article key={concept.id} className={selectedConceptId===concept.id?"conceptCard selected":"conceptCard"} data-testid="creative-concept">
                <strong>{concept.title}</strong>
                <span>{concept.hook}</span>
                <p>{concept.angle}</p>
                <small>{concept.rationale}</small>
                <label>Hook<input aria-label={`${concept.title} hook`} value={concept.hook} onChange={(e)=>setCreativeConcepts((items)=>items.map((item)=>item.id===concept.id?{...item,hook:e.target.value}:item))}/></label>
                <label>CTA<input aria-label={`${concept.title} CTA`} value={concept.cta} onChange={(e)=>setCreativeConcepts((items)=>items.map((item)=>item.id===concept.id?{...item,cta:e.target.value}:item))}/></label>
                <label>Script<textarea aria-label={`${concept.title} script`} value={concept.script} onChange={(e)=>setCreativeConcepts((items)=>items.map((item)=>item.id===concept.id?{...item,script:e.target.value}:item))}/></label>
                <div className="conceptActions">
                  <button type="button" className="toolButton" onClick={()=>sendConceptToStoryboard(concept)}>Use concept → scene plan</button>
                  <button type="button" className="primary" onClick={()=>void orchestrateConceptToEdit(concept)}>Build initial edit</button>
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="variantToolbar">
          <button
            type="button"
            className="toolButton"
            disabled={project.overlays.length === 0}
            onClick={generatePlatformVariants}
          >
            Generate platform variants
          </button>
          {campaignVariants.length > 0 && (
            <span data-testid="variant-count">{campaignVariants.length} editable variants</span>
          )}
        </div>
        {campaignVariants.length > 0 && (
          <div className="variantGrid" data-testid="variant-grid">
            {campaignVariants.map((variant) => (
              <article key={variant.id} className="variantCard" data-testid="campaign-variant">
                <div>
                  <strong>{variant.name}</strong>
                  <span>{variant.ratio}</span>
                </div>
                <small>{variant.platform}</small>
                <small>{variant.hook}</small>
                <button type="button" className="toolButton" onClick={() => loadCampaignVariant(variant)}>
                  Edit variant
                </button>
              </article>
            ))}
          </div>
        )}

        <div className="variantToolbar">
          <button type="button" className="toolButton" disabled={!selectedCreativeConcept()} onClick={generateLanguageCampaignVariants}>
            Generate AR / EN variants
          </button>
          <button type="button" className="toolButton" disabled={!selectedCreativeConcept()} onClick={generateCampaignExperiments}>
            Generate 3 experiments
          </button>
        </div>

        {languageVariants.length > 0 && (
          <div className="languageVariantGrid" data-testid="language-variant-grid">
            {languageVariants.map((variant) => (
              <article key={variant.id} className="languageVariantCard" data-testid="language-variant" dir={variant.direction}>
                <div>
                  <strong>{variant.language.toUpperCase()}</strong>
                  <span>{variant.reviewRequired ? "Review" : "Ready"}</span>
                </div>
                <p>{variant.hook}</p>
                <small>{variant.cta}</small>
                <button type="button" className="toolButton" onClick={() => applyLanguageVariant(variant)}>
                  Apply language
                </button>
              </article>
            ))}
          </div>
        )}

        {campaignExperiments.length > 0 && (
          <div className="experimentGrid" data-testid="experiment-grid">
            {campaignExperiments.map((experiment) => (
              <article key={experiment.id} className="experimentCard" data-testid="campaign-experiment">
                <div>
                  <strong>Variant {experiment.index}</strong>
                  <span>Master {experiment.masterConceptId.slice(0, 8)}</span>
                </div>
                <p>{experiment.hook}</p>
                <small>{experiment.rationale}</small>
                <button type="button" className="toolButton" onClick={() => applyCampaignExperiment(experiment)}>
                  Apply experiment
                </button>
              </article>
            ))}
          </div>
        )}

        <div className={`brandGuardian ${brandGuardian.status}`} data-testid="brand-guardian">
          <div className="brandGuardianHeader">
            <div>
              <strong>Brand Guardian</strong>
              <small>Preflight before campaign export</small>
            </div>
            <span data-testid="guardian-status">
              {brandGuardian.status === "pass"
                ? `Pass · ${brandGuardian.warnings} warnings`
                : `Blocked · ${brandGuardian.errors} errors`}
            </span>
          </div>
          {brandGuardian.issues.length === 0 ? (
            <p className="hint">Brand, CTA and claims checks passed.</p>
          ) : (
            <div className="guardianIssues">
              {brandGuardian.issues.map((issue) => (
                <div key={issue.id} className={`guardianIssue ${issue.severity}`} data-testid="guardian-issue">
                  <b>{issue.code}</b>
                  <span>{issue.message}</span>
                </div>
              ))}
            </div>
          )}
          {brandGuardian.warnings > 0 && (
            <button type="button" className="toolButton" onClick={applyBrandKitToProject}>
              Apply Brand Kit fixes
            </button>
          )}
          <button
            type="button"
            className="primary"
            data-testid="export-campaign-pack"
            disabled={brandGuardian.status === "blocked" || campaignPackState === "exporting"}
            onClick={() => void exportCampaignPack()}
          >
            {campaignPackState === "exporting" ? "Building Campaign Pack…" : "Export Campaign Pack ZIP"}
          </button>
          {campaignPackError && <p className="providerError">{campaignPackError}</p>}
        </div>
      </section>
      )}

      <section className={workspaceView === "campaign" ? "workspace workspaceHidden" : "workspace"}>
        <aside className={workspaceView === "editor" ? "panel leftPanel editorMode" : "panel leftPanel"}>
          {workspaceView === "editor" && (
            <nav className="editorToolRail" aria-label="Editor tools" data-testid="editor-tool-rail">
              {([
                ["media", "Media", "M"],
                ["text", "Text", "T"],
                ["brand", "Brand", "B"],
                ["ai", "AI", "AI"],
                ["captions", "Captions", "CC"],
                ["audio", "Audio", "A"],
                ["templates", "Templates", "TP"],
              ] as Array<[EditorTool, string, string]>).map(([tool, label, short]) => (
                <button
                  type="button"
                  key={tool}
                  aria-label={`${label} tools`}
                  aria-pressed={editorTool === tool}
                  className={editorTool === tool ? "editorToolButton active" : "editorToolButton"}
                  onClick={() => { setEditorTool(tool); setInspectorTab("properties"); }}
                >
                  <span>{short}</span>
                  <small>{label}</small>
                </button>
              ))}
            </nav>
          )}
          <div className="toolPanelContent">
          {workspaceView === "batch" && (<>
          <h2>Batch Generation</h2>
          <div className="batchPanel" data-testid="batch-panel">
            <div className="batchHeader">
              <strong>CSV → branded variants</strong>
              <span>Max {MAX_BATCH_ROWS} rows</span>
            </div>
            <label>
              Default template
              <select
                aria-label="Batch default template"
                value={batchTemplate}
                onChange={(e) => setBatchTemplate(e.target.value as MarketingTemplateId)}
              >
                {MARKETING_TEMPLATES.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="toolButton fileButton">
              Import CSV
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={onBatchCsvUpload}
                hidden
              />
            </label>
            <label>
              CSV rows
              <textarea
                aria-label="Batch CSV"
                value={batchCsv}
                onChange={(e) => setBatchCsv(e.target.value)}
              />
            </label>
            <small>
              Columns: name, headline, body, cta, ratio, language, template
            </small>
            <button
              type="button"
              className="primary"
              disabled={batchState === "generating"}
              onClick={() => void runBatchGeneration()}
            >
              {batchState === "generating" ? "Generating batch…" : "Generate batch"}
            </button>
            {batchError && <p className="providerError">{batchError}</p>}
            {batchResult && (
              <>
                <div className="batchSummary" data-testid="batch-summary">
                  <strong>{batchResult.acceptedRows} ready</strong>
                  <span>{batchResult.rejectedRows} invalid</span>
                  <span>{batchResult.truncatedRows} truncated</span>
                </div>
                <div className="batchResults">
                  {batchResult.variants.map((variant, index) => (
                    <article
                      key={variant.id}
                      className={`batchVariant ${variant.status}`}
                      data-testid="batch-variant"
                    >
                      <div>
                        <strong>
                          {variant.project?.name ?? `Row ${variant.rowIndex}`}
                        </strong>
                        <span>{variant.status}</span>
                      </div>
                      {variant.project ? (
                        <>
                          <small>
                            {variant.project.ratio} · {variant.source.language ?? "en"} · {variant.source.template ?? batchTemplate}
                          </small>
                          <button
                            type="button"
                            className="toolButton"
                            onClick={() => loadBatchVariant(index)}
                          >
                            Load variant
                          </button>
                        </>
                      ) : (
                        <small>{variant.errors.join(" · ")}</small>
                      )}
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>
          </>)}

          {workspaceView === "publishing" && (<>
          <h2>Publishing & Calendar</h2>
          <div className="publishingPanel" data-testid="publishing-panel">
            <div className="publishingHeader">
              <strong>Approved handoff</strong>
              <span>{approval.status}</span>
            </div>
            <label>
              Connector
              <select
                aria-label="Publishing connector"
                value={publishingConnectorId}
                onChange={(e) => setPublishingConnectorId(e.target.value)}
                disabled={publishingState === "loading"}
              >
                {publishingConnectors.map((connector) => (
                  <option key={connector.id} value={connector.id}>
                    {connector.label} · {connector.status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Workspace
              <input
                aria-label="Publishing workspace"
                value={publishingWorkspaceId}
                onChange={(e) => setPublishingWorkspaceId(e.target.value)}
              />
            </label>
            <label>
              Account
              <input
                aria-label="Publishing account"
                value={publishingAccountId}
                onChange={(e) => setPublishingAccountId(e.target.value)}
              />
            </label>
            <label>
              Caption / post copy
              <textarea
                aria-label="Publishing caption"
                value={publishingCaption}
                onChange={(e) => setPublishingCaption(e.target.value)}
              />
            </label>
            <label>
              Schedule
              <input
                aria-label="Publishing schedule"
                type="datetime-local"
                value={publishingSchedule}
                onChange={(e) => setPublishingSchedule(e.target.value)}
              />
            </label>
            {approval.status !== "approved" && (
              <small data-testid="publishing-approval-blocker">
                Project must be Approved before publishing or scheduling.
              </small>
            )}
            <button
              type="button"
              className="primary"
              disabled={
                approval.status !== "approved" ||
                !publishingConnectorId ||
                publishingState === "loading"
              }
              onClick={() => void createPublishingHandoffFromProject()}
            >
              {publishingSchedule ? "Schedule handoff" : "Create publishing handoff"}
            </button>
            {publishingError && <p className="providerError">{publishingError}</p>}
            {publishingHandoffs.length > 0 && (
              <div className="publishingCalendar" data-testid="publishing-calendar">
                {publishingHandoffs.map((handoff) => (
                  <article
                    key={handoff.id}
                    className="publishingHandoff"
                    data-testid="publishing-handoff"
                  >
                    <div>
                      <strong>{handoff.channel}</strong>
                      <span>{handoff.status}</span>
                    </div>
                    <small>{handoff.workspaceId} · {handoff.accountId}</small>
                    <small>{handoff.projectName}</small>
                    <time>
                      {handoff.scheduledAt
                        ? new Date(handoff.scheduledAt).toLocaleString()
                        : "Ready for immediate handoff"}
                    </time>
                  </article>
                ))}
              </div>
            )}
          </div>
          </>)}

          {(workspaceView !== "editor" || editorTool === "media") && (<>
          <h2>{workspaceView === "editor" ? "Media" : "Assets"}</h2>
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
                {item.generation && (
                  <small className="assetGeneration" data-testid="asset-generation-meta">
                    AI · {item.generation.provider} · {item.generation.model} · {item.generation.operation}
                  </small>
                )}
                {item.proxyBlob && (
                  <small className="assetGeneration" data-testid="asset-proxy-meta">
                    Proxy preview · {Math.round(
                      ((item.proxySize ?? item.proxyBlob.size) /
                        Math.max(1, item.proxySourceSize ?? item.blob.size)) *
                        100
                    )}% of source
                  </small>
                )}
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
          <label className="toolButton fileButton">+ Logo / image<input type="file" accept="image/*" onChange={addLogo} hidden /></label>
          </>)}

          {workspaceView === "editor" && editorTool === "text" && (<>
            <h2>Text</h2>
            <button className="toolButton" onClick={addText}>+ Add text layer</button>
            <p className="hint">Select a text layer on the canvas to edit typography, timing and motion.</p>
          </>)}

          {workspaceView === "editor" && editorTool === "audio" && (<>
            <h2>Audio</h2>
            <label className="toolButton fileButton">+ Music / audio<input type="file" accept="audio/*" onChange={onAudioUpload} hidden /></label>
            <p className="hint">{audioTrack ? `Selected: ${audioTrack.name}` : "Add music, voiceover or SFX. Mixing controls appear in the inspector."}</p>
          </>)}

          {workspaceView === "editor" && editorTool === "captions" && (<>
            <h2>Captions</h2>
            <button className="toolButton" type="button" onClick={() => void generateCaptions()} disabled={captionState === "generating"}>
              {captionState === "generating" ? "Generating captions…" : captions ? "Regenerate captions" : "Generate captions"}
            </button>
            <p className="hint">{captions ? `${captions.cues.length} timed cues · ${captions.detectedLanguage}` : "Automatic Arabic / English captions and transcript editing."}</p>
          </>)}

          {workspaceView === "editor" && editorTool === "ai" && (<>
          <h2>AI Providers</h2>
          <div className="providerPanel" data-testid="provider-panel">
            <div className="providerPanelHeader">
              <strong>Provider Router</strong>
              <span className={`providerState ${providerState}`}>
                {providerState === "loading"
                  ? "Loading…"
                  : providerState === "saving"
                    ? "Switching…"
                    : providerState === "error"
                      ? "Error"
                      : "Ready"}
              </span>
            </div>
            {(["image", "video", "voice"] as ProviderCapability[]).map((capability) => (
              <label key={capability}>
                {capability[0].toUpperCase() + capability.slice(1)} provider
                <select
                  aria-label={`${capability[0].toUpperCase() + capability.slice(1)} provider`}
                  value={providerDirectory?.selections[capability] ?? ""}
                  disabled={!providerDirectory || providerState === "loading" || providerState === "saving"}
                  onChange={(e) => void selectAIProvider(capability, e.target.value)}
                >
                  {(providerDirectory?.providers ?? [])
                    .filter(
                      (provider) =>
                        provider.configured &&
                        provider.capabilities.includes(capability)
                    )
                    .map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.label}
                      </option>
                    ))}
                </select>
                {providerDirectory?.selections[capability] && (
                  <small>
                    {(providerDirectory.providers.find(
                      (provider) =>
                        provider.id === providerDirectory.selections[capability]
                    )?.models[capability] ?? []).join(", ")}
                  </small>
                )}
              </label>
            ))}
            {providerError && <p className="providerError">{providerError}</p>}
          </div>

          <h2>Generation Ledger</h2>
          <div className="generationLedgerPanel" data-testid="generation-ledger">
            <div className="generationLedgerSummary">
              <strong>{generationLedger.length} records</strong>
              <span>
                Est. cost {generationLedger
                  .reduce((sum, record) => sum + (record.estimatedCost ?? 0), 0)
                  .toFixed(4)}
              </span>
            </div>
            {generationLedger.length === 0 && (
              <p className="hint">AI generations will appear here with provider/model/result linkage.</p>
            )}
            {generationLedger.slice(-6).reverse().map((record) => (
              <div
                className={`generationRecord ${record.status}`}
                key={record.id}
                data-testid="generation-record"
              >
                <div>
                  <strong>{record.operation}</strong>
                  <span>{record.status}</span>
                </div>
                <small>{record.provider} · {record.model}</small>
                <small title={record.request}>{record.request}</small>
                <small>
                  cost {record.estimatedCost ?? 0}
                  {record.resultAssetId ? ` · result ${record.resultAssetId.slice(0, 8)}` : ""}
                </small>
              </div>
            ))}
          </div>

          {media?.generation && (
            <>
              <h2>Provenance</h2>
              <div className="provenancePanel" data-testid="provenance-panel">
                <div className="provenanceGrid">
                  <span>Origin</span>
                  <strong>{media.generation.origin ?? "ai-generated"}</strong>
                  <span>Provider</span>
                  <strong>{media.generation.provider}</strong>
                  <span>Model</span>
                  <strong>{media.generation.model}</strong>
                  <span>Rights</span>
                  <strong>{media.generation.rightsStatus ?? "provider-terms"}</strong>
                  <span>Review</span>
                  <strong data-testid="provenance-review">
                    {media.generation.reviewStatus ?? "unreviewed"}
                  </strong>
                  {media.generation.sourceAssetId && (
                    <>
                      <span>Source</span>
                      <strong>{media.generation.sourceAssetId.slice(0, 8)}</strong>
                    </>
                  )}
                </div>
                <small title={media.generation.prompt}>{media.generation.prompt}</small>
                <div className="provenanceActions">
                  <button
                    type="button"
                    onClick={() => reviewSelectedGeneratedAsset("approved")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => reviewSelectedGeneratedAsset("rejected")}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => reviewSelectedGeneratedAsset("unreviewed")}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </>
          )}

          <h2>AI Image</h2>
          <div className="imageGenerationPanel" data-testid="image-generation-panel">
            <label>
              Prompt
              <textarea
                aria-label="Image prompt"
                value={imagePrompt}
                placeholder="Describe the marketing image you want…"
                onChange={(e) => setImagePrompt(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="toolButton"
              onClick={() => void generateImageAsset()}
              disabled={imageGenerationState === "generating" || providerState !== "ready"}
            >
              {imageGenerationState === "generating" ? "Generating…" : "Generate image"}
            </button>
            {imageGenerationError && <p className="providerError">{imageGenerationError}</p>}
          </div>

          <h2>AI Image Tools</h2>
          <div className="imageToolPanel" data-testid="image-tool-panel">
            <p className="hint">
              {media?.kind === "image"
                ? `Selected: ${media.name}`
                : "Select an image from Assets first."}
            </p>
            <label>
              Edit instruction
              <textarea
                aria-label="Image edit prompt"
                value={imageEditPrompt}
                placeholder="Change lighting, product styling, background…"
                onChange={(e) => setImageEditPrompt(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="toolButton"
              disabled={media?.kind !== "image" || imageToolState === "working"}
              onClick={() => void createImageVariant("edit", imageEditPrompt)}
            >
              AI edit selected
            </button>
            <div className="imageToolGrid">
              <button
                type="button"
                className="toolButton"
                disabled={media?.kind !== "image" || imageToolState === "working"}
                onClick={() =>
                  void createImageVariant(
                    "background",
                    "Remove the background cleanly and preserve the main subject."
                  )
                }
              >
                Remove background
              </button>
              <button
                type="button"
                className="toolButton"
                disabled={
                  media?.kind !== "image" ||
                  !imageEditPrompt.trim() ||
                  imageToolState === "working"
                }
                onClick={() =>
                  void createImageVariant(
                    "background",
                    `Replace the background as follows: ${imageEditPrompt.trim()}`
                  )
                }
              >
                Replace background
              </button>
            </div>
            <div className="outpaintGrid">
              {(Object.keys(RATIOS) as RatioKey[]).map((ratioKey) => (
                <button
                  type="button"
                  key={ratioKey}
                  disabled={media?.kind !== "image" || imageToolState === "working"}
                  onClick={() =>
                    void createImageVariant(
                      "outpaint",
                      `Expand this image naturally to ${ratioKey} for marketing while preserving the original subject and composition.`,
                      ratioKey
                    )
                  }
                >
                  Outpaint {ratioKey}
                </button>
              ))}
            </div>
            {imageToolState === "working" && <small>Creating editable variant…</small>}
            {imageToolError && <p className="providerError">{imageToolError}</p>}
          </div>

          <h2>AI Video</h2>
          <div className="avGenerationPanel" data-testid="video-generation-panel">
            <label>
              Video prompt
              <textarea
                aria-label="Video prompt"
                value={videoPrompt}
                placeholder="Describe the shot, movement and mood…"
                onChange={(e) => setVideoPrompt(e.target.value)}
              />
            </label>
            <label>
              Duration seconds
              <input
                aria-label="Video duration"
                type="number"
                min={1}
                max={30}
                value={videoDurationSeconds}
                onChange={(e) =>
                  setVideoDurationSeconds(
                    Math.max(1, Math.min(30, Number(e.target.value) || 1))
                  )
                }
              />
            </label>
            <div className="imageToolGrid">
              <button
                type="button"
                className="toolButton"
                disabled={videoGenerationState === "generating" || providerState !== "ready"}
                onClick={() => void generateVideoAsset(false)}
              >
                Text → Video
              </button>
              <button
                type="button"
                className="toolButton"
                disabled={
                  videoGenerationState === "generating" ||
                  providerState !== "ready" ||
                  media?.kind !== "image"
                }
                onClick={() => void generateVideoAsset(true)}
              >
                Image → Video
              </button>
            </div>
            {videoGenerationState === "generating" && <small>Generating video asset…</small>}
            {videoGenerationError && <p className="providerError">{videoGenerationError}</p>}
          </div>

          <h2>AI Voiceover</h2>
          <div className="avGenerationPanel" data-testid="voice-generation-panel">
            <label>
              Script
              <textarea
                aria-label="Voiceover text"
                value={voiceText}
                placeholder="اكتب نص التعليق الصوتي أو voiceover script…"
                onChange={(e) => setVoiceText(e.target.value)}
              />
            </label>
            <label>
              Language
              <select
                aria-label="Voiceover language"
                value={voiceLanguage}
                onChange={(e) =>
                  setVoiceLanguage(e.target.value as "auto" | "ar" | "en")
                }
              >
                <option value="auto">Auto</option>
                <option value="ar">Arabic</option>
                <option value="en">English</option>
              </select>
            </label>
            <button
              type="button"
              className="toolButton"
              disabled={voiceGenerationState === "generating" || providerState !== "ready"}
              onClick={() => void generateVoiceover()}
            >
              {voiceGenerationState === "generating" ? "Generating voice…" : "Generate voiceover"}
            </button>
            <small>Generated voiceover becomes the editable Audio Track.</small>
            {voiceGenerationError && <p className="providerError">{voiceGenerationError}</p>}
          </div>

          <h2>Storyboard</h2>
          <div className="storyboardPanel" data-testid="storyboard-panel">
            <label>
              Brief / script
              <textarea
                aria-label="Storyboard brief"
                value={storyboardBrief}
                placeholder="Paste the campaign brief or script…"
                onChange={(e) => setStoryboardBrief(e.target.value)}
              />
            </label>
            <div className="imageToolGrid">
              <button
                type="button"
                className="toolButton"
                disabled={storyboardState === "generating"}
                onClick={() => void generateStoryboardPlan()}
              >
                {storyboardState === "generating" && !storyboard
                  ? "Planning…"
                  : "Generate storyboard"}
              </button>
              <button
                type="button"
                className="toolButton"
                disabled={!storyboard || storyboardState === "generating"}
                onClick={() => void suggestStoryboardBroll()}
              >
                Suggest B-roll
              </button>
            </div>
            {storyboardError && <p className="providerError">{storyboardError}</p>}
            {storyboard && (
              <>
                <small data-testid="storyboard-meta">
                  {storyboard.provider} · {storyboard.model} · {storyboard.scenes.length} scenes
                </small>
                <div className="storyboardScenes">
                  {storyboard.scenes.map((scene) => (
                    <article
                      key={scene.id}
                      className="storyboardScene"
                      data-testid="storyboard-scene"
                    >
                      <div className="storyboardSceneHeader">
                        <strong>{scene.order}. {scene.title}</strong>
                        <span>{scene.duration}s</span>
                      </div>
                      <label>
                        Title
                        <input
                          aria-label={`Storyboard scene ${scene.order} title`}
                          value={scene.title}
                          onChange={(e) =>
                            updateStoryboardScene(scene.id, { title: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Narration
                        <textarea
                          aria-label={`Storyboard scene ${scene.order} narration`}
                          value={scene.narration}
                          onChange={(e) =>
                            updateStoryboardScene(scene.id, { narration: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Shot prompt
                        <textarea
                          aria-label={`Storyboard scene ${scene.order} visual prompt`}
                          value={scene.visualPrompt}
                          onChange={(e) =>
                            updateStoryboardScene(scene.id, { visualPrompt: e.target.value })
                          }
                        />
                      </label>
                      <div className="storyboardSceneGrid">
                        <label>
                          Duration
                          <input
                            aria-label={`Storyboard scene ${scene.order} duration`}
                            type="number"
                            min={1}
                            max={30}
                            value={scene.duration}
                            onChange={(e) =>
                              updateStoryboardScene(scene.id, {
                                duration: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                          />
                        </label>
                        <label>
                          Asset need
                          <select
                            aria-label={`Storyboard scene ${scene.order} asset need`}
                            value={scene.assetNeed}
                            onChange={(e) =>
                              updateStoryboardScene(scene.id, {
                                assetNeed: e.target.value as StoryboardAssetNeed,
                              })
                            }
                          >
                            <option value="existing">Existing</option>
                            <option value="generate-image">Generate image</option>
                            <option value="generate-video">Generate video</option>
                            <option value="b-roll">B-roll</option>
                          </select>
                        </label>
                      </div>
                      {scene.broll.length > 0 && (
                        <div className="brollList" data-testid="broll-list">
                          {scene.broll.map((option) => (
                            <button
                              type="button"
                              key={`${scene.id}-${option.rank}`}
                              onClick={() => useBrollOption(option)}
                            >
                              <b>#{option.rank}</b>
                              <span>{option.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>
          </>)}

          {workspaceView === "editor" && editorTool === "brand" && (<>
          <h2>Brand Kit</h2>
          <div className="brandKitPanel" data-testid="brand-kit">
            <div className="brandKitHeader">
              <strong>{brandKit.name}</strong>
              <span className={`brandState ${brandState}`}>
                {brandState === "saving" ? "Saving…" : brandState === "saved" ? "Saved" : brandState === "error" ? "Error" : "Local"}
              </span>
            </div>
            <label>
              Brand name
              <input
                aria-label="Brand name"
                value={brandKit.name}
                onChange={(e) => updateBrandKit({ name: e.target.value })}
              />
            </label>
            <div className="brandColorGrid">
              <label>
                Primary
                <input
                  aria-label="Brand primary color"
                  type="color"
                  value={brandKit.primaryColor}
                  onChange={(e) => updateBrandKit({ primaryColor: e.target.value })}
                />
              </label>
              <label>
                Secondary
                <input
                  aria-label="Brand secondary color"
                  type="color"
                  value={brandKit.secondaryColor}
                  onChange={(e) => updateBrandKit({ secondaryColor: e.target.value })}
                />
              </label>
            </div>
            <label>
              Heading font
              <input
                aria-label="Brand heading font"
                value={brandKit.headingFont}
                onChange={(e) => updateBrandKit({ headingFont: e.target.value })}
              />
            </label>
            <label>
              Body font
              <input
                aria-label="Brand body font"
                value={brandKit.bodyFont}
                onChange={(e) => updateBrandKit({ bodyFont: e.target.value })}
              />
            </label>
            <div className="brandNumberGrid">
              <label>
                Heading weight
                <input
                  aria-label="Brand heading weight"
                  type="number"
                  min={400}
                  max={900}
                  step={100}
                  value={brandKit.headingWeight}
                  onChange={(e) => updateBrandKit({ headingWeight: Number(e.target.value) })}
                />
              </label>
              <label>
                Safe zone %
                <input
                  aria-label="Brand safe zone"
                  type="number"
                  min={0}
                  max={25}
                  value={brandKit.safeZone}
                  onChange={(e) => updateBrandKit({ safeZone: Number(e.target.value) })}
                />
              </label>
            </div>
            <div className="brandNumberGrid">
              <label>
                Caption size
                <input
                  aria-label="Brand caption size"
                  type="number"
                  min={14}
                  max={64}
                  value={brandKit.captionFontSize}
                  onChange={(e) => updateBrandKit({ captionFontSize: Number(e.target.value) })}
                />
              </label>
              <label>
                Caption width %
                <input
                  aria-label="Brand caption width"
                  type="number"
                  min={40}
                  max={96}
                  value={brandKit.captionMaxWidth}
                  onChange={(e) => updateBrandKit({ captionMaxWidth: Number(e.target.value) })}
                />
              </label>
            </div>
            <label className="toolButton fileButton brandLogoUpload">
              {brandKit.logoName ? "Replace approved logo" : "+ Approved logo"}
              <input type="file" accept="image/*" onChange={onBrandLogoUpload} hidden />
            </label>
            {brandKit.logoDataUrl && (
              <div className="brandLogoPreview" data-testid="brand-logo-preview">
                <img src={brandKit.logoDataUrl} alt="Approved brand logo" />
                <span>{brandKit.logoName}</span>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => updateBrandKit({ logoDataUrl: null, logoName: null })}
                >
                  Remove
                </button>
              </div>
            )}
            {brandKit.logoDataUrl && (
              <div className="brandNumberGrid brandLogoPlacement">
                <label>
                  Logo width %
                  <input
                    aria-label="Brand logo width"
                    type="number"
                    min={5}
                    max={45}
                    value={brandKit.logoWidth}
                    onChange={(e) => updateBrandKit({ logoWidth: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Logo X %
                  <input
                    aria-label="Brand logo X"
                    type="number"
                    min={0}
                    max={100}
                    value={brandKit.logoX}
                    onChange={(e) => updateBrandKit({ logoX: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Logo Y %
                  <input
                    aria-label="Brand logo Y"
                    type="number"
                    min={0}
                    max={100}
                    value={brandKit.logoY}
                    onChange={(e) => updateBrandKit({ logoY: Number(e.target.value) })}
                  />
                </label>
              </div>
            )}
            <button type="button" className="toolButton applyBrand" onClick={applyBrandKitToProject}>
              Apply Brand
            </button>
          </div>
          </>)}

          {workspaceView === "editor" && editorTool === "templates" && (<>
          <h2>Templates</h2>
          <div className="templateGrid" data-testid="marketing-templates">
            {MARKETING_TEMPLATES.map((template) => (
              <button
                type="button"
                key={template.id}
                className="templateCard"
                aria-label={`Start template ${template.name}`}
                onClick={() => startMarketingTemplate(template.id)}
              >
                <span>{template.ratio}</span>
                <strong>{template.name}</strong>
                <small>{template.description}</small>
              </button>
            ))}
          </div>
          </>)}

          {workspaceView === "editor" && editorTool === "media" && (<>
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
          </>)}
          </div>
        </aside>

        <section className="stageArea">
          <div className="stageWrap">
            <div ref={stageRef} className="stage" style={{ aspectRatio: `${ratio.w}/${ratio.h}` }}>
              {!media && <div className="emptyStage"><b>Drop in your first creative</b><span>Video + text + logo + social ratio</span></div>}
              {media?.kind === "video" && (
                <video
                  ref={videoRef}
                  src={media.proxyUrl ?? media.url}
                  data-preview-source={media.proxyUrl ? "proxy" : "original"}
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
              {media?.kind === "image" && <img id="creative-image" src={media.proxyUrl ?? media.url} data-preview-source={media.proxyUrl ? "proxy" : "original"} alt="Creative source" className="mediaLayer" style={clipMediaStyle(activeMediaClip, transitionVisual.primaryClip?.assetId === media.id ? transitionVisual.primaryOpacity : 1)} />}
              {normalizeClipChroma(activeMediaClip?.chroma).enabled && (
                <canvas
                  ref={chromaPreviewCanvasRef}
                  className="mediaLayer chromaPreviewCanvas"
                  data-testid="chroma-preview"
                  data-chroma-key={normalizeClipChroma(activeMediaClip?.chroma).keyColor}
                  data-chroma-background={normalizeClipChroma(activeMediaClip?.chroma).backgroundColor}
                />
              )}
              {transitionVisual.type === "crossfade" && transitionSecondaryMedia?.kind === "image" && (
                <img
                  data-testid="transition-media-layer"
                  src={transitionSecondaryMedia.proxyUrl ?? transitionSecondaryMedia.url}
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

              {project.overlays
                .filter((overlay) => isOverlayActive(overlay, timeline.playhead))
                .map((overlay) => {
                  const animated = resolveOverlayAnimation(overlay, timeline.playhead);
                  return (
                    <div
                      key={overlay.id}
                      className={selectedId === overlay.id ? "overlay selected" : "overlay"}
                      data-testid={`overlay-${overlay.id}`}
                      data-motion-x={animated.x.toFixed(3)}
                      data-motion-y={animated.y.toFixed(3)}
                      data-motion-opacity={animated.opacity.toFixed(3)}
                      data-motion-scale={animated.scale.toFixed(3)}
                      data-motion-rotation={animated.rotation.toFixed(3)}
                      data-mask-shape={normalizeOverlayMask(overlay.mask).shape}
                      data-blend-mode={normalizeOverlayBlendMode(overlay.blendMode)}
                      style={{
                        left: `${animated.x}%`,
                        top: `${animated.y}%`,
                        transform: `translate(-50%,-50%) rotate(${animated.rotation}deg) scale(${animated.scale})`,
                        clipPath: overlayClipPath(overlay.mask),
                        mixBlendMode: normalizeOverlayBlendMode(overlay.blendMode),
                      }}
                      onPointerDown={(e) => dragOverlay(e, overlay)}
                      onClick={() => setSelectedId(overlay.id)}
                    >
                      {overlay.kind === "text" ? (
                        <span
                          style={{
                            fontSize: `${Math.max(12, overlay.fontSize * 0.55)}px`,
                            fontWeight: overlay.fontWeight,
                            fontFamily: overlay.fontFamily ?? "Arial, sans-serif",
                            color: overlay.color,
                            opacity: animated.opacity,
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
                          style={{ width: `${Math.max(56, overlay.width * 4)}px`, opacity: animated.opacity }}
                        />
                      )}
                    </div>
                  );
                })}
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
          <div className="inspectorTabs" role="tablist" aria-label="Inspector">
            {([
              ["properties", "Properties"],
              ["review", "Review"],
              ["advanced", "Advanced"],
            ] as Array<[InspectorTab, string]>).map(([tab, label]) => (
              <button
                type="button"
                key={tab}
                role="tab"
                aria-selected={inspectorTab === tab}
                className={inspectorTab === tab ? "inspectorTab active" : "inspectorTab"}
                onClick={() => setInspectorTab(tab)}
              >
                {label}
              </button>
            ))}
          </div>

          {inspectorTab === "review" && (<>
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
                  <small>{snapshot.reason === "manual" ? "Manual" : "Auto"} · {snapshot.mediaCount} asset{snapshot.mediaCount === 1 ? "" : "s"} · {snapshot.commentCount} comment{snapshot.commentCount === 1 ? "" : "s"} · {snapshot.motionComponentCount} motion component{snapshot.motionComponentCount === 1 ? "" : "s"} · {snapshot.approvalStatus.replaceAll("_", " ")}</small>
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

          <h2>Approval</h2>
          <div className="providerPanel" data-testid="approval-panel">
            <div className="providerPanelHeader">
              <strong data-testid="approval-status">
                {approval.status.replaceAll("_", " ")}
              </strong>
              <span>
                {reviewComments.filter((comment) => !comment.resolved).length} open comment
                {reviewComments.filter((comment) => !comment.resolved).length === 1 ? "" : "s"}
              </span>
            </div>
            {approval.updatedAt && (
              <small>
                Updated {new Date(approval.updatedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </small>
            )}
            {approval.note && (
              <p className="hint" data-testid="approval-current-note">{approval.note}</p>
            )}
            <label>
              Approval note
              <textarea
                aria-label="Approval note"
                rows={2}
                placeholder="Optional review or approval note…"
                value={approvalNote}
                onChange={(event) => setApprovalNote(event.target.value)}
              />
            </label>
            <div className="assetActions">
              <button
                type="button"
                aria-label="Send for review"
                disabled={approval.status === "in_review"}
                onClick={() => markApproval("in_review")}
              >
                Send for review
              </button>
              <button
                type="button"
                aria-label="Request changes"
                disabled={approval.status === "changes_requested"}
                onClick={() => markApproval("changes_requested")}
              >
                Request changes
              </button>
              <button
                type="button"
                aria-label="Approve project"
                disabled={
                  approval.status === "approved" ||
                  reviewComments.some((comment) => !comment.resolved)
                }
                onClick={() => markApproval("approved")}
              >
                Approve
              </button>
              <button
                type="button"
                aria-label="Return approval to draft"
                disabled={approval.status === "draft"}
                onClick={() => markApproval("draft")}
              >
                Draft
              </button>
            </div>
            {reviewComments.some((comment) => !comment.resolved) && (
              <small data-testid="approval-blocker">
                Resolve all open review comments before approval.
              </small>
            )}
          </div>

          <h2>Review comments</h2>
          <div className="providerPanel" data-testid="review-comments">
            <label>
              Comment at {formatTimelineTime(timeline.playhead)}
              <textarea
                aria-label="Review comment"
                rows={3}
                placeholder="Add a review note for this timecode…"
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="primary"
              disabled={!commentDraft.trim()}
              onClick={addReviewComment}
            >
              Add comment
            </button>
            <div className="providerPanelHeader">
              <strong>{reviewComments.filter((comment) => !comment.resolved).length} open</strong>
              <span>{reviewComments.length} total</span>
            </div>
            {reviewComments.length === 0 && (
              <p className="hint">No review comments yet.</p>
            )}
            {[...reviewComments]
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((comment) => (
                <div
                  className="generationRecord"
                  key={comment.id}
                  data-testid="review-comment"
                  data-resolved={comment.resolved ? "true" : "false"}
                >
                  <div>
                    <button
                      type="button"
                      className="ghost"
                      aria-label={`Jump to comment at ${formatTimelineTime(comment.timelineTime)}`}
                      onClick={() => seekTimelineTo(comment.timelineTime, false)}
                    >
                      {formatTimelineTime(comment.timelineTime)}
                    </button>
                    <span>{comment.resolved ? "Resolved" : "Open"}</span>
                  </div>
                  <strong>{comment.body}</strong>
                  <small>
                    {new Date(comment.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                  <div className="assetActions">
                    <button
                      type="button"
                      aria-label={comment.resolved ? "Reopen comment" : "Resolve comment"}
                      onClick={() => toggleReviewComment(comment.id)}
                    >
                      {comment.resolved ? "Reopen" : "Resolve"}
                    </button>
                  </div>
                </div>
              ))}
          </div>
          </>)}

          {inspectorTab === "advanced" && (<>
          <h2>Motion</h2>
          {!selected && <p className="hint">Select a text or logo overlay to animate it.</p>}
          {selected && (
            <div className="motionInspector" data-testid="motion-inspector">
              <div className="clipMeta">
                <strong>{selected.kind === "text" ? selected.text : "Image overlay"}</strong>
                <span>{selected.keyframes?.length ?? 0} keyframes</span>
              </div>
              <div className="motionPresetGrid" data-testid="motion-preset-grid">
                {MOTION_PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset.id}
                    title={preset.description}
                    disabled={timeline.duration <= 0}
                    onClick={() => applySelectedMotionPreset(preset.id)}
                  >
                    <strong>{preset.label}</strong>
                    <small>{preset.description}</small>
                  </button>
                ))}
              </div>
              <div className="providerPanel" data-testid="motion-component-library">
                <label>
                  Component name
                  <input
                    aria-label="Motion component name"
                    placeholder="e.g. Brand CTA Pop"
                    value={motionComponentName}
                    onChange={(event) => setMotionComponentName(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="toolButton"
                  aria-label="Save motion component"
                  disabled={(selected.keyframes?.length ?? 0) < 2}
                  onClick={saveSelectedMotionComponent}
                >
                  Save current motion
                </button>
                {motionComponents.length === 0 && (
                  <p className="hint">No reusable motion components yet.</p>
                )}
                {motionComponents.map((component) => (
                  <div
                    className="generationRecord"
                    data-testid="motion-component"
                    key={component.id}
                  >
                    <div>
                      <strong>{component.name}</strong>
                      <span>{component.frames.length} frames</span>
                    </div>
                    <small>
                      {component.sourceKind} · {component.sourceDuration.toFixed(2)}s source motion
                    </small>
                    <div className="assetActions">
                      <button
                        type="button"
                        aria-label={`Apply motion component ${component.name}`}
                        onClick={() => applySavedMotionComponent(component)}
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete motion component ${component.name}`}
                        onClick={() => deleteMotionComponent(component.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="toolButton"
                disabled={timeline.duration <= 0}
                onClick={addSelectedOverlayKeyframe}
              >
                Add keyframe at {formatTimelineTime(timeline.playhead)}
              </button>
              {(selected.keyframes?.length ?? 0) > 0 && (
                <div className="keyframeList" data-testid="keyframe-list">
                  {[...(selected.keyframes ?? [])]
                    .sort((a, b) => a.time - b.time)
                    .map((keyframe, index) => (
                      <button
                        type="button"
                        key={keyframe.id}
                        data-testid="overlay-keyframe"
                        className={selectedKeyframeId === keyframe.id ? "keyframeItem active" : "keyframeItem"}
                        onClick={() => {
                          setSelectedKeyframeId(keyframe.id);
                          seekTimelineTo(keyframe.time, false);
                        }}
                      >
                        <span>KF {index + 1}</span>
                        <strong>{formatTimelineTime(keyframe.time)}</strong>
                        <small>{keyframe.easing}</small>
                      </button>
                    ))}
                </div>
              )}
              {selectedKeyframe && (
                <div className="keyframeEditor" data-testid="keyframe-editor">
                  <label>
                    Time
                    <input
                      aria-label="Keyframe time"
                      type="number"
                      min={0}
                      max={timeline.duration}
                      step={0.1}
                      value={selectedKeyframe.time}
                      onChange={(e) => {
                        const time = Number(e.target.value);
                        updateSelectedOverlayKeyframe({ time });
                        seekTimelineTo(time, false);
                      }}
                    />
                  </label>
                  <label>
                    Easing
                    <select
                      aria-label="Keyframe easing"
                      value={selectedKeyframe.easing}
                      onChange={(e) =>
                        updateSelectedOverlayKeyframe({
                          easing: e.target.value as OverlayEasing,
                        })
                      }
                    >
                      <option value="linear">Linear</option>
                      <option value="ease-in">Ease in</option>
                      <option value="ease-out">Ease out</option>
                      <option value="ease-in-out">Ease in/out</option>
                    </select>
                  </label>
                  <div className="keyframeValueGrid">
                    <label>
                      X %
                      <input
                        aria-label="Keyframe X"
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={selectedKeyframe.value.x}
                        onChange={(e) =>
                          updateSelectedOverlayKeyframe({}, { x: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Y %
                      <input
                        aria-label="Keyframe Y"
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={selectedKeyframe.value.y}
                        onChange={(e) =>
                          updateSelectedOverlayKeyframe({}, { y: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Opacity
                      <input
                        aria-label="Keyframe opacity"
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={selectedKeyframe.value.opacity}
                        onChange={(e) =>
                          updateSelectedOverlayKeyframe({}, { opacity: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Scale
                      <input
                        aria-label="Keyframe scale"
                        type="number"
                        min={0.05}
                        max={8}
                        step={0.05}
                        value={selectedKeyframe.value.scale}
                        onChange={(e) =>
                          updateSelectedOverlayKeyframe({}, { scale: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Rotation
                      <input
                        aria-label="Keyframe rotation"
                        type="number"
                        min={-720}
                        max={720}
                        step={1}
                        value={selectedKeyframe.value.rotation}
                        onChange={(e) =>
                          updateSelectedOverlayKeyframe({}, { rotation: Number(e.target.value) })
                        }
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="danger"
                    onClick={removeSelectedOverlayKeyframe}
                  >
                    Delete keyframe
                  </button>
                </div>
              )}
            </div>
          )}

          <h2>Compositing</h2>
          {!selected && <p className="hint">Select an overlay to configure masks and blend mode.</p>}
          {selected && (
            <div className="compositingInspector" data-testid="compositing-inspector">
              <label>
                Mask
                <select
                  aria-label="Overlay mask shape"
                  value={normalizeOverlayMask(selected.mask).shape}
                  onChange={(e) =>
                    updateOverlay(selected.id, {
                      mask: {
                        ...normalizeOverlayMask(selected.mask),
                        shape: e.target.value as OverlayMaskShape,
                      },
                    })
                  }
                >
                  <option value="none">None</option>
                  <option value="rectangle">Rectangle</option>
                  <option value="ellipse">Ellipse</option>
                </select>
              </label>
              <label>
                Mask inset %
                <input
                  aria-label="Overlay mask inset"
                  type="number"
                  min={0}
                  max={45}
                  step={1}
                  disabled={normalizeOverlayMask(selected.mask).shape === "none"}
                  value={normalizeOverlayMask(selected.mask).inset}
                  onChange={(e) =>
                    updateOverlay(selected.id, {
                      mask: {
                        ...normalizeOverlayMask(selected.mask),
                        inset: Math.max(0, Math.min(45, Number(e.target.value))),
                      },
                    })
                  }
                />
              </label>
              <label>
                Blend mode
                <select
                  aria-label="Overlay blend mode"
                  value={normalizeOverlayBlendMode(selected.blendMode)}
                  onChange={(e) =>
                    updateOverlay(selected.id, {
                      blendMode: e.target.value as OverlayBlendMode,
                    })
                  }
                >
                  <option value="normal">Normal</option>
                  <option value="multiply">Multiply</option>
                  <option value="screen">Screen</option>
                  <option value="overlay">Overlay</option>
                </select>
              </label>
              <button
                type="button"
                className="ghost"
                onClick={() =>
                  updateOverlay(selected.id, {
                    mask: { shape: "none", inset: 0 },
                    blendMode: "normal",
                  })
                }
              >
                Reset compositing
              </button>
            </div>
          )}

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
          </>)}

          {inspectorTab === "properties" && editorTool === "captions" && (<>
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
          </>)}

          {inspectorTab === "advanced" && (<>
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
          </>)}

          {inspectorTab === "properties" && editorTool === "audio" && (<>
          <h2>Audio track</h2>
          {!audioTrack && <p className="hint">Add music or audio from the Elements panel.</p>}
          {audioTrack && (
            <div className="audioInspector" data-testid="audio-inspector">
              <div className="clipMeta">
                <strong>{audioTrack.name}</strong>
                <span>audio</span>
              </div>
              {audioTrack.generation && (
                <small className="assetGeneration" data-testid="audio-generation-meta">
                  AI · {audioTrack.generation.provider} · {audioTrack.generation.model} · {audioTrack.generation.operation}
                </small>
              )}
              <div className="audioMixPanel" data-testid="audio-mix-panel">
                <label>
                  Track role
                  <select
                    aria-label="Audio track role"
                    value={audioTrack.role}
                    onChange={(e) =>
                      updateAudioTrack({ role: e.target.value as AudioTrackRole })
                    }
                  >
                    <option value="music">Music</option>
                    <option value="voiceover">Voiceover</option>
                    <option value="sfx">SFX</option>
                  </select>
                </label>
                <label>
                  Source audio level {Math.round(project.volume * 100)}%
                  <input
                    aria-label="Source audio level"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    disabled={media?.kind !== "video"}
                    value={project.volume}
                    onChange={(e) =>
                      replaceProject((current) => ({
                        ...current,
                        volume: Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <label className="toggleLabel">
                  <input
                    aria-label="Source audio muted"
                    type="checkbox"
                    disabled={media?.kind !== "video"}
                    checked={project.muted}
                    onChange={(e) =>
                      replaceProject((current) => ({
                        ...current,
                        muted: e.target.checked,
                      }))
                    }
                  />
                  Mute source audio
                </label>
                <label className="toggleLabel">
                  <input
                    aria-label="Normalize audio track"
                    type="checkbox"
                    checked={audioTrack.normalizeEnabled}
                    disabled={audioTrack.measuredPeak === null || audioTrack.measuredPeak <= 0.0001}
                    onChange={(e) =>
                      updateAudioTrack({ normalizeEnabled: e.target.checked })
                    }
                  />
                  Normalize track peak
                </label>
                <label>
                  Normalize target {Math.round(audioTrack.normalizeTarget * 100)}%
                  <input
                    aria-label="Normalize target"
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    disabled={!audioTrack.normalizeEnabled}
                    value={audioTrack.normalizeTarget}
                    onChange={(e) =>
                      updateAudioTrack({ normalizeTarget: Number(e.target.value) })
                    }
                  />
                </label>
                <small data-testid="audio-peak">
                  {audioTrack.measuredPeak === null
                    ? "Peak unavailable"
                    : `Measured peak ${Math.round(audioTrack.measuredPeak * 100)}% · normalization ×${audioNormalizationGain(audioTrack).toFixed(2)}`}
                </small>
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
              <div className="duckingControls" data-testid="ducking-controls">
                <label className="toggleLabel">
                  <input
                    aria-label="Automatic music ducking"
                    type="checkbox"
                    checked={audioTrack.duckingEnabled}
                    disabled={!captions?.cues.length || audioTrack.role !== "music"}
                    onChange={(e) => updateAudioTrack({ duckingEnabled: e.target.checked })}
                  />
                  Duck music under speech
                </label>
                <label>
                  Speech gain
                  <input
                    aria-label="Ducking gain"
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={audioTrack.duckingGain}
                    disabled={!audioTrack.duckingEnabled}
                    onChange={(e) => updateAudioTrack({ duckingGain: Number(e.target.value) })}
                  />
                </label>
                <small>
                  {captions?.cues.length
                    ? audioTrack.role === "music"
                      ? `Music drops to ${Math.round(audioTrack.duckingGain * 100)}% while captioned speech is active.`
                      : "Set the track role to Music to enable automatic ducking."
                    : "Generate captions first to detect speech ranges."}
                </small>
              </div>
              <button type="button" className="danger" onClick={() => setAudioTrack(null)}>Remove audio</button>
            </div>
          )}
          </>)}

          {inspectorTab === "properties" && editorTool === "media" && (<>
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
              <div className="chromaPanel" data-testid="chroma-panel">
                <label className="toggleLabel">
                  <input
                    aria-label="Chroma key enabled"
                    type="checkbox"
                    checked={normalizeClipChroma(selectedClip.chroma).enabled}
                    onChange={(e) =>
                      updateSelectedClipChroma({ enabled: e.target.checked })
                    }
                  />
                  Chroma key / background replacement
                </label>
                <div className="chromaGrid">
                  <label>
                    Key color
                    <input
                      aria-label="Chroma key color"
                      type="color"
                      value={normalizeClipChroma(selectedClip.chroma).keyColor}
                      onChange={(e) =>
                        updateSelectedClipChroma({ keyColor: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Background
                    <input
                      aria-label="Chroma background color"
                      type="color"
                      value={normalizeClipChroma(selectedClip.chroma).backgroundColor}
                      onChange={(e) =>
                        updateSelectedClipChroma({ backgroundColor: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  Tolerance {Math.round(normalizeClipChroma(selectedClip.chroma).tolerance * 100)}%
                  <input
                    aria-label="Chroma tolerance"
                    type="range"
                    min={0.01}
                    max={1}
                    step={0.01}
                    value={normalizeClipChroma(selectedClip.chroma).tolerance}
                    onChange={(e) =>
                      updateSelectedClipChroma({ tolerance: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Spill suppression {Math.round(normalizeClipChroma(selectedClip.chroma).spill * 100)}%
                  <input
                    aria-label="Chroma spill"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={normalizeClipChroma(selectedClip.chroma).spill}
                    onChange={(e) =>
                      updateSelectedClipChroma({ spill: Number(e.target.value) })
                    }
                  />
                </label>
                {selectedClip.kind === "video" && normalizeClipChroma(selectedClip.chroma).enabled && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      const video = videoRef.current;
                      if (!video) return;
                      if (video.paused) {
                        void video.play().catch(() => undefined);
                      } else {
                        video.pause();
                      }
                    }}
                  >
                    Play / pause keyed preview
                  </button>
                )}
                <small>Pixel keying is non-destructive and is applied to preview/export while the source asset remains unchanged.</small>
              </div>
              <div className="colorGradePanel" data-testid="color-grade-panel">
                <div className="clipMeta">
                  <strong>Color & LUT</strong>
                  <span>{normalizeClipColorGrade(selectedClip.colorGrade).lut}</span>
                </div>
                <label>
                  Exposure {normalizeClipColorGrade(selectedClip.colorGrade).exposure.toFixed(2)}
                  <input
                    aria-label="Clip exposure"
                    type="range"
                    min={-2}
                    max={2}
                    step={0.05}
                    value={normalizeClipColorGrade(selectedClip.colorGrade).exposure}
                    onChange={(e) =>
                      updateSelectedClipColorGrade({ exposure: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Contrast {normalizeClipColorGrade(selectedClip.colorGrade).contrast.toFixed(2)}
                  <input
                    aria-label="Clip contrast"
                    type="range"
                    min={0.5}
                    max={1.8}
                    step={0.05}
                    value={normalizeClipColorGrade(selectedClip.colorGrade).contrast}
                    onChange={(e) =>
                      updateSelectedClipColorGrade({ contrast: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Saturation {normalizeClipColorGrade(selectedClip.colorGrade).saturation.toFixed(2)}
                  <input
                    aria-label="Clip saturation"
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={normalizeClipColorGrade(selectedClip.colorGrade).saturation}
                    onChange={(e) =>
                      updateSelectedClipColorGrade({ saturation: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  LUT preset
                  <select
                    aria-label="Clip LUT"
                    value={normalizeClipColorGrade(selectedClip.colorGrade).lut}
                    onChange={(e) =>
                      updateSelectedClipColorGrade({
                        lut: e.target.value as ClipLutPreset,
                      })
                    }
                  >
                    <option value="none">None</option>
                    <option value="warm">Warm</option>
                    <option value="cool">Cool</option>
                    <option value="cinematic">Cinematic</option>
                    <option value="mono">Monochrome</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="ghost"
                  onClick={() =>
                    updateSelectedClipColorGrade({
                      exposure: 0,
                      contrast: 1,
                      saturation: 1,
                      lut: "none",
                    })
                  }
                >
                  Reset color
                </button>
                <small>Color settings are stored as clip metadata; the original source file is never modified.</small>
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
          </>)}

          {inspectorTab === "properties" && (editorTool === "text" || editorTool === "brand" || (editorTool === "media" && selected?.kind === "image")) && (<>
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
              <label>Text<textarea aria-label="Text" value={selected.text} dir="auto" onChange={(e) => updateOverlay(selected.id, { text: e.target.value } as Partial<Overlay>)} /></label>
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
            <b>Timed overlays</b>
            <span>Text and logo timing stays editable on the timeline and is respected by preview/export.</span>
          </div>
          </>)}

          {inspectorTab === "properties" && editorTool === "ai" && (
            <div className="inspectorEmpty">
              <strong>AI tools</strong>
              <span>Use the AI panel on the left. Generated assets remain editable on the canvas and timeline.</span>
            </div>
          )}
          {inspectorTab === "properties" && editorTool === "templates" && (
            <div className="inspectorEmpty">
              <strong>Template properties</strong>
              <span>Start a template from the left, then select its text, media or logo layers to edit them here.</span>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
