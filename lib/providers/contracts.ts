export type ProviderJob<TInput, TOutput> = {
  provider: string;
  model: string;
  input: TInput;
  estimatedCost?: number;
  run(): Promise<TOutput>;
};

export interface ImageProvider {
  generate(input: { prompt: string; aspectRatio?: string }): ProviderJob<unknown, { url: string }>;
}

export interface VideoProvider {
  generate(input: { prompt: string; imageUrl?: string; durationSeconds?: number }): ProviderJob<unknown, { url: string }>;
}

export interface VoiceProvider {
  synthesize(input: { text: string; voice?: string; language?: string }): ProviderJob<unknown, { url: string }>;
}
