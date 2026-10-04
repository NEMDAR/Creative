import type { Overlay, OverlayKeyframe } from "./types";
import { baseOverlayKeyframeValue } from "./keyframes";

export type MotionPresetId = "fade-in" | "slide-up" | "pop" | "drift";

export const MOTION_PRESETS: Array<{
  id: MotionPresetId;
  label: string;
  description: string;
}> = [
  { id: "fade-in", label: "Fade In", description: "Clean opacity entrance." },
  { id: "slide-up", label: "Slide Up", description: "Enter from below with fade." },
  { id: "pop", label: "Pop", description: "Fast scale pop with soft settle." },
  { id: "drift", label: "Drift", description: "Slow horizontal cinematic drift." },
];

export function applyMotionPreset(
  overlay: Overlay,
  preset: MotionPresetId,
  startTime: number,
  endTime: number
): Overlay {
  const base = baseOverlayKeyframeValue(overlay);
  const safeEnd = Math.max(startTime + 0.2, endTime);
  const entranceEnd = Math.min(safeEnd, startTime + Math.min(0.8, (safeEnd - startTime) * 0.45));
  let keyframes: OverlayKeyframe[] = [];

  if (preset === "fade-in") {
    keyframes = [
      frame(startTime, { ...base, opacity: 0 }, "linear"),
      frame(entranceEnd, { ...base, opacity: base.opacity }, "ease-out"),
    ];
  } else if (preset === "slide-up") {
    keyframes = [
      frame(startTime, { ...base, y: Math.min(100, base.y + 12), opacity: 0 }, "linear"),
      frame(entranceEnd, base, "ease-out"),
    ];
  } else if (preset === "pop") {
    const peakTime = Math.min(safeEnd, startTime + Math.max(0.18, (entranceEnd - startTime) * 0.55));
    keyframes = [
      frame(startTime, { ...base, scale: Math.max(0.05, base.scale * 0.72), opacity: 0 }, "linear"),
      frame(peakTime, { ...base, scale: base.scale * 1.08, opacity: base.opacity }, "ease-out"),
      frame(entranceEnd, base, "ease-in-out"),
    ];
  } else {
    keyframes = [
      frame(startTime, { ...base, x: Math.max(0, base.x - 4) }, "linear"),
      frame(safeEnd, { ...base, x: Math.min(100, base.x + 4) }, "ease-in-out"),
    ];
  }

  return { ...overlay, keyframes };
}

function frame(
  time: number,
  value: OverlayKeyframe["value"],
  easing: OverlayKeyframe["easing"]
): OverlayKeyframe {
  return {
    id: crypto.randomUUID(),
    time,
    easing,
    value,
  };
}
