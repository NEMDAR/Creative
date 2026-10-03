export type RatioKey = "9:16" | "1:1" | "4:5" | "16:9";

export type TextOverlay = {
  id: string;
  kind: "text";
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontWeight: number;
  color: string;
  opacity: number;
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
