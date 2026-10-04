import type {
  ImageEditInput,
  ImageGenerateInput,
  ProviderAdapter,
  ProviderArtifact,
  ProviderCapability,
  ProviderJob,
  VideoGenerateInput,
  VoiceSynthesizeInput,
} from "./contracts";

type MockProviderConfig = {
  id: string;
  label: string;
  tier: "fast" | "quality";
};

export function createMockProvider(config: MockProviderConfig): ProviderAdapter {
  const imageModel = `mock-image-${config.tier}`;
  const videoModel = `mock-video-${config.tier}`;
  const voiceModel = `mock-voice-${config.tier}`;

  return {
    descriptor: {
      id: config.id,
      label: config.label,
      configured: true,
      capabilities: ["image", "video", "voice"],
      models: {
        image: [imageModel],
        video: [videoModel],
        voice: [voiceModel],
      },
    },
    image: {
      generate: (input) =>
        job(config.id, imageModel, "image", input, () => ({
          url: mockSvgDataUrl(input.prompt, config.tier),
          mimeType: "image/svg+xml",
          provider: config.id,
          model: imageModel,
          metadata: { mock: true, tier: config.tier, operation: "generate" },
        })),
      edit: (input) =>
        job(config.id, imageModel, "image", input, () => ({
          url: input.imageUrl,
          mimeType: "image/*",
          provider: config.id,
          model: imageModel,
          metadata: { mock: true, tier: config.tier, operation: "edit" },
        })),
    },
    video: {
      generate: (input) =>
        job(config.id, videoModel, "video", input, () => ({
          url: mockWebmDataUrl(),
          mimeType: "video/webm",
          provider: config.id,
          model: videoModel,
          metadata: {
            mock: true,
            tier: config.tier,
            durationSeconds: input.durationSeconds ?? 5,
          },
        })),
    },
    voice: {
      synthesize: (input) =>
        job(config.id, voiceModel, "voice", input, () => ({
          url: mockSilentWavDataUrl(),
          mimeType: "audio/wav",
          provider: config.id,
          model: voiceModel,
          metadata: {
            mock: true,
            tier: config.tier,
            language: input.language ?? "auto",
            voice: input.voice ?? "default",
          },
        })),
    },
  };
}

function job<TInput>(
  provider: string,
  model: string,
  capability: ProviderCapability,
  input: TInput,
  run: () => ProviderArtifact
): ProviderJob<TInput, ProviderArtifact> {
  return {
    provider,
    model,
    capability,
    input,
    estimatedCost: 0,
    async run() {
      await Promise.resolve();
      return run();
    },
  };
}

function mockSvgDataUrl(prompt: string, tier: string) {
  const safe = escapeXml(prompt.slice(0, 80) || "Generated image");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
  <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#09254B"/><stop offset="1" stop-color="#168BF1"/></linearGradient></defs>
  <rect width="1024" height="1024" fill="url(#g)"/>
  <text x="64" y="470" fill="#F8F5F1" font-size="50" font-family="Arial" font-weight="700">${safe}</text>
  <text x="64" y="545" fill="#F8F5F1" opacity=".72" font-size="28" font-family="Arial">NEMDAR mock · ${tier}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

const MOCK_WEBM_BASE64 =
  "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAANsEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEjTbuMU6uEHFO7a1OsggNW7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjEuNy4xMDNXQYxMYXZmNjEuNy4xMDNEiYhAgsAAAAAAABZUrmvIrgEAAAAAAAA/14EBc8WIjSjSH7I+PAmcgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4QCYloA4JCwgaC6gVqagQJVsIRVuYEBElTDZ/tzc59jwIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYxLjcuMTAzc3PWY8CLY8WIjSjSH7I+PAlnyKFFo4dFTkNPREVSRIeUTGF2YzYxLjE5LjEwMSBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAwLjYwMDAwMDAwMAAfQ7Z1Qa3ngQCjvYEAAIBQBQCdASqgAFoAAEcIhYWIhYSIAgIABigPCHVUmu4h1VJruIdVSa7iHVUmu4h1VJruIbwA/v+rUICjmIEAKAARAgABEBAAGAAYWC/0AAiAgQAAAKOYgQBQABECAAEQEAAYABhYL/QACICBAAAAo5iBAHgAEQIAARAQABgAGFgv9AAIgIEAAACjmIEAoAARAgABEBAAGAAYWC/0AAiAgQAAAKOYgQDIABECAAEQEAAYABhYL/QACICBAAAAo5iBAPAAEQIAARAQABgAGFgv9AAIgIEAAACjl4EBGADxAQABEBAUYABhYL/QACICBAAAo5iBAUAAEQIAARAQABgAGFgv9AAIgIEAAACjmIEBaAARAgABEBAAGAAYWC/0AAiAgQAAAKOYgQGQABECAAEQEAAYABhYL/QACICBAAAAo5iBAbgAEQIAARAQABgAGFgv9AAIgIEAAACjmIEB4AARAgABEBAAGAAYWC/0AAiAgQAAAKOYgQIIABECAAEQEAAYABhYL/QACICBAAAAo5iBAjAAEQIAARAQABgAGFgv9AAIgIEAAAAcU7trkbuPs4EAt4r3gQHxggGj8IED";

function mockWebmDataUrl() {
  return `data:video/webm;base64,${MOCK_WEBM_BASE64}`;
}

function mockSilentWavDataUrl(seconds = 1, sampleRate = 8000) {
  const samples = Math.max(1, Math.floor(seconds * sampleRate));
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return `data:audio/wav;base64,${buffer.toString("base64")}`;
}
