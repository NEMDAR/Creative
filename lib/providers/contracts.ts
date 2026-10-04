export type ProviderCapability =
  | "image"
  | "video"
  | "voice";

export type ProviderJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export type ProviderDescriptor = {
  id: string;
  label: string;
  capabilities: ProviderCapability[];
  configured: boolean;
  models: Partial<Record<ProviderCapability, string[]>>;
  routing?: {
    quality: number;
    latencyMs: number;
    estimatedCostUsd: Partial<Record<ProviderCapability, number>>;
  };
};

export type ProviderArtifact = {
  url: string;
  mimeType: string;
  provider: string;
  model: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type ProviderJob<TInput, TOutput> = {
  provider: string;
  model: string;
  capability: ProviderCapability;
  input: TInput;
  estimatedCost?: number;
  run(): Promise<TOutput>;
};

export type ImageGenerateInput = {
  prompt: string;
  aspectRatio?: string;
};

export type ImageEditInput = {
  prompt: string;
  imageUrl: string;
  aspectRatio?: string;
};

export type VideoGenerateInput = {
  prompt: string;
  imageUrl?: string;
  durationSeconds?: number;
  aspectRatio?: string;
};

export type VoiceSynthesizeInput = {
  text: string;
  voice?: string;
  language?: string;
};

export interface ImageProvider {
  generate(input: ImageGenerateInput): ProviderJob<ImageGenerateInput, ProviderArtifact>;
  edit?(input: ImageEditInput): ProviderJob<ImageEditInput, ProviderArtifact>;
}

export interface VideoProvider {
  generate(input: VideoGenerateInput): ProviderJob<VideoGenerateInput, ProviderArtifact>;
}

export interface VoiceProvider {
  synthesize(input: VoiceSynthesizeInput): ProviderJob<VoiceSynthesizeInput, ProviderArtifact>;
}

export type ProviderAdapter = {
  descriptor: ProviderDescriptor;
  image?: ImageProvider;
  video?: VideoProvider;
  voice?: VoiceProvider;
};

export type ProviderSelection = Record<ProviderCapability, string>;

export type ProviderDirectorySnapshot = {
  providers: ProviderDescriptor[];
  selections: ProviderSelection;
};
