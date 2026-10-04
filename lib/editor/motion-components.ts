import { baseOverlayKeyframeValue } from "./keyframes";
import type { Overlay, OverlayEasing, OverlayKeyframeValue } from "./types";

export type MotionComponentFrame = {
  offset: number;
  easing: OverlayEasing;
  deltaX: number;
  deltaY: number;
  opacityRatio: number;
  scaleRatio: number;
  rotationDelta: number;
};

export type MotionComponent = {
  id: string;
  name: string;
  createdAt: number;
  sourceKind: Overlay["kind"];
  sourceDuration: number;
  frames: MotionComponentFrame[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function captureMotionComponent(
  overlay: Overlay,
  name: string
): MotionComponent | null {
  const frames = [...(overlay.keyframes ?? [])].sort((a, b) => a.time - b.time);
  if (frames.length < 2) return null;

  const base = baseOverlayKeyframeValue(overlay);
  const start = frames[0].time;
  const end = frames[frames.length - 1].time;
  const span = Math.max(0.001, end - start);

  return {
    id: crypto.randomUUID(),
    name: name.trim() || "Motion component",
    createdAt: Date.now(),
    sourceKind: overlay.kind,
    sourceDuration: span,
    frames: frames.map((keyframe) => ({
      offset: clamp((keyframe.time - start) / span, 0, 1),
      easing: keyframe.easing,
      deltaX: keyframe.value.x - base.x,
      deltaY: keyframe.value.y - base.y,
      opacityRatio:
        Math.abs(base.opacity) > 0.001
          ? keyframe.value.opacity / base.opacity
          : keyframe.value.opacity,
      scaleRatio:
        Math.abs(base.scale) > 0.001
          ? keyframe.value.scale / base.scale
          : keyframe.value.scale,
      rotationDelta: keyframe.value.rotation - base.rotation,
    })),
  };
}

export function applyMotionComponent(
  overlay: Overlay,
  component: MotionComponent,
  startTime: number,
  endTime: number
): Overlay {
  const base = baseOverlayKeyframeValue(overlay);
  const safeEnd = Math.max(startTime + 0.2, endTime);
  const span = safeEnd - startTime;

  return {
    ...overlay,
    keyframes: component.frames.map((frame) => ({
      id: crypto.randomUUID(),
      time: startTime + clamp(frame.offset, 0, 1) * span,
      easing: frame.easing,
      value: {
        x: clamp(base.x + frame.deltaX, 0, 100),
        y: clamp(base.y + frame.deltaY, 0, 100),
        opacity: clamp(base.opacity * frame.opacityRatio, 0, 1),
        scale: Math.max(0.05, base.scale * frame.scaleRatio),
        rotation: base.rotation + frame.rotationDelta,
      } satisfies OverlayKeyframeValue,
    })),
  };
}
