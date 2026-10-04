export type RatioKey = "9:16" | "1:1" | "4:5" | "16:9";

export type OverlayEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";
export type OverlayMaskShape = "none" | "rectangle" | "ellipse";
export type OverlayBlendMode = "normal" | "multiply" | "screen" | "overlay";
export type OverlayMask = { shape: OverlayMaskShape; inset: number };

export type OverlayKeyframeValue = {
  x: number;
  y: number;
  opacity: number;
  scale: number;
  rotation: number;
};

export type OverlayKeyframe = {
  id: string;
  time: number;
  easing: OverlayEasing;
  value: OverlayKeyframeValue;
};

export type TextOverlay = {
  id: string;
  kind: "text";
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontWeight: number;
  fontFamily?: string;
  color: string;
  opacity: number;
  scale?: number;
  rotation?: number;
  keyframes?: OverlayKeyframe[];
  mask?: OverlayMask;
  blendMode?: OverlayBlendMode;
  align: "left" | "center" | "right";
  direction: "ltr" | "rtl";
  startTime?: number;
  endTime?: number | null;
};

export type ImageOverlay = {
  id: string;
  kind: "image";
  src: string;
  x: number;
  y: number;
  width: number;
  opacity: number;
  scale?: number;
  rotation?: number;
  keyframes?: OverlayKeyframe[];
  mask?: OverlayMask;
  blendMode?: OverlayBlendMode;
  startTime?: number;
  endTime?: number | null;
};

export type Overlay = TextOverlay | ImageOverlay;

export type CreatorProject = {
  schemaVersion: 1;
  name: string;
  ratio: RatioKey;
  trimStart: number;
  trimEnd: number | null;
  volume: number;
  muted: boolean;
  overlays: Overlay[];
};
