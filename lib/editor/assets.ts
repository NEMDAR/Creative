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
  origin?: "ai-generated" | "ai-edited";
  rightsStatus?: "provider-terms" | "review-required";
  reviewStatus?: "unreviewed" | "approved" | "rejected";
};

export type AssetReviewStatus = "unreviewed" | "approved" | "rejected";

export type GenerationRecord = {
  id: string;
  capability: "image" | "video" | "voice" | "planning";
  operation: AssetGenerationMetadata["operation"] | "storyboard" | "broll";
  provider: string;
  model: string;
  request: string;
  status: "succeeded" | "failed";
  estimatedCost: number | null;
  resultAssetId?: string;
  sourceAssetId?: string;
  createdAt: number;
  completedAt: number;
  error?: string;
};

export function withDefaultProvenance(
  metadata: AssetGenerationMetadata
): AssetGenerationMetadata {
  return {
    ...metadata,
    origin:
      metadata.operation === "generate" ||
      metadata.operation === "video_generate" ||
      metadata.operation === "voice_synthesize"
        ? "ai-generated"
        : "ai-edited",
    rightsStatus: metadata.rightsStatus ?? "provider-terms",
    reviewStatus: metadata.reviewStatus ?? "unreviewed",
  };
}
