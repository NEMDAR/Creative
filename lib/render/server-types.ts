import type { TimelineState } from "../editor/timeline";

export type RenderOverlayManifest = {
  id: string;
  field: string;
  x: number;
  y: number;
  width: number;
  height: number;
  startTime: number;
  endTime: number;
};

export type RenderAudioManifest = {
  id: string;
  field: string;
  startTime: number;
  duration: number;
  gain: number;
  fadeIn: number;
  fadeOut: number;
};

export type ServerRenderManifest = {
  schemaVersion: 1;
  projectName: string;
  output: {
    width: number;
    height: number;
    fps: number;
  };
  duration: number;
  timeline: TimelineState;
  media: Array<{
    id: string;
    field: string;
    kind: "video" | "image";
    name: string;
  }>;
  overlays: RenderOverlayManifest[];
  audioTrack: RenderAudioManifest | null;
};

export type RenderJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export type DurableRenderJob = {
  jobId: string;
  status: RenderJobStatus;
  progress: number;
  stage: string;
  createdAt: number;
  updatedAt: number;
  manifestFile: string;
  assetMapFile: string;
  outputFile: string;
  outputUrl?: string;
  error?: string;
};
