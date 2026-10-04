export type AssetGenerationMetadata = {
  provider: string;
  model: string;
  prompt: string;
  createdAt: number;
  estimatedCost: number | null;
  operation: "generate" | "edit" | "background" | "outpaint" | "video_generate" | "image_to_video" | "voice_synthesize";
  sourceAssetId?: string;
  requestedAspectRatio?: string;
  requestedDurationSeconds?: number;
  language?: string;
  voice?: string;
};
