import type { CreatorProject } from "../editor/types";

export type RenderJobRequest = {
  projectId: string;
  composition: CreatorProject;
  output: {
    format: "mp4" | "webm" | "png";
    width: number;
    height: number;
    fps?: number;
  };
};

export type RenderJobResult = {
  jobId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  outputUrl?: string;
  error?: string;
};
