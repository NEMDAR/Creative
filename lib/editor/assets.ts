export type AssetGenerationMetadata = {
  provider: string;
  model: string;
  prompt: string;
  createdAt: number;
  estimatedCost: number | null;
  operation: "generate" | "edit" | "background" | "outpaint";
  sourceAssetId?: string;
  requestedAspectRatio?: string;
};
