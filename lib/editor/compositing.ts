import type { OverlayBlendMode, OverlayMask } from "./types";

export function normalizeOverlayMask(mask?: OverlayMask): OverlayMask {
  return {
    shape: mask?.shape ?? "none",
    inset: clamp(mask?.inset ?? 0, 0, 45),
  };
}

export function overlayClipPath(mask?: OverlayMask) {
  const normalized = normalizeOverlayMask(mask);
  if (normalized.shape === "none") return "none";
  if (normalized.shape === "ellipse") {
    const radius = Math.max(5, 50 - normalized.inset);
    return `ellipse(${radius}% ${radius}% at 50% 50%)`;
  }
  return `inset(${normalized.inset}% round 8%)`;
}

export function normalizeOverlayBlendMode(
  mode?: OverlayBlendMode
): OverlayBlendMode {
  return mode ?? "normal";
}

export function canvasCompositeOperation(
  mode?: OverlayBlendMode
): GlobalCompositeOperation {
  const normalized = normalizeOverlayBlendMode(mode);
  if (normalized === "multiply") return "multiply";
  if (normalized === "screen") return "screen";
  if (normalized === "overlay") return "overlay";
  return "source-over";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
