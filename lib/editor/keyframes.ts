import type {
  Overlay,
  OverlayEasing,
  OverlayKeyframe,
  OverlayKeyframeValue,
} from "./types";

export function baseOverlayKeyframeValue(overlay: Overlay): OverlayKeyframeValue {
  return {
    x: overlay.x,
    y: overlay.y,
    opacity: overlay.opacity,
    scale: overlay.scale ?? 1,
    rotation: overlay.rotation ?? 0,
  };
}

export function resolveOverlayAnimation(
  overlay: Overlay,
  timelineTime: number
): OverlayKeyframeValue {
  const keyframes = [...(overlay.keyframes ?? [])].sort((a, b) => a.time - b.time);
  if (keyframes.length === 0) return baseOverlayKeyframeValue(overlay);
  if (timelineTime <= keyframes[0].time) return normalizeValue(keyframes[0].value);
  if (timelineTime >= keyframes[keyframes.length - 1].time) {
    return normalizeValue(keyframes[keyframes.length - 1].value);
  }

  const rightIndex = keyframes.findIndex((keyframe) => keyframe.time >= timelineTime);
  const left = keyframes[Math.max(0, rightIndex - 1)];
  const right = keyframes[rightIndex];
  const span = Math.max(0.0001, right.time - left.time);
  const raw = clamp((timelineTime - left.time) / span, 0, 1);
  const progress = applyEasing(raw, right.easing ?? "linear");

  return {
    x: lerp(left.value.x, right.value.x, progress),
    y: lerp(left.value.y, right.value.y, progress),
    opacity: clamp(lerp(left.value.opacity, right.value.opacity, progress), 0, 1),
    scale: clamp(lerp(left.value.scale, right.value.scale, progress), 0.05, 8),
    rotation: lerp(left.value.rotation, right.value.rotation, progress),
  };
}

export function upsertOverlayKeyframe(
  overlay: Overlay,
  keyframe: OverlayKeyframe
): Overlay {
  const withoutSameTime = (overlay.keyframes ?? []).filter(
    (item) => Math.abs(item.time - keyframe.time) > 0.001 && item.id !== keyframe.id
  );
  return {
    ...overlay,
    keyframes: [...withoutSameTime, keyframe].sort((a, b) => a.time - b.time),
  };
}

export function deleteOverlayKeyframe(overlay: Overlay, keyframeId: string): Overlay {
  return {
    ...overlay,
    keyframes: (overlay.keyframes ?? []).filter((keyframe) => keyframe.id !== keyframeId),
  };
}

export function createOverlayKeyframe(
  overlay: Overlay,
  time: number,
  easing: OverlayEasing = "ease-in-out"
): OverlayKeyframe {
  return {
    id: crypto.randomUUID(),
    time: Math.max(0, time),
    easing,
    value: resolveOverlayAnimation(overlay, time),
  };
}

export function applyEasing(progress: number, easing: OverlayEasing) {
  const t = clamp(progress, 0, 1);
  if (easing === "ease-in") return t * t;
  if (easing === "ease-out") return 1 - (1 - t) * (1 - t);
  if (easing === "ease-in-out") {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
  return t;
}

function normalizeValue(value: OverlayKeyframeValue): OverlayKeyframeValue {
  return {
    x: value.x,
    y: value.y,
    opacity: clamp(value.opacity, 0, 1),
    scale: clamp(value.scale, 0.05, 8),
    rotation: value.rotation,
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
