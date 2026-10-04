import { routeProvider, type RoutingDecision, type RoutingPolicy } from "../operations/control-plane";
import type {
  ImageEditInput,
  ImageGenerateInput,
  ProviderAdapter,
  ProviderCapability,
  ProviderDirectorySnapshot,
  ProviderSelection,
  VideoGenerateInput,
  VoiceSynthesizeInput,
} from "./contracts";

export class ProviderRouter {
  private readonly adapters = new Map<string, ProviderAdapter>();
  private readonly selections: ProviderSelection;

  constructor(initial?: Partial<ProviderSelection>) {
    this.selections = {
      image: initial?.image ?? "",
      video: initial?.video ?? "",
      voice: initial?.voice ?? "",
    };
  }

  register(adapter: ProviderAdapter) {
    if (!adapter.descriptor.id.trim()) {
      throw new Error("Provider id is required.");
    }
    this.adapters.set(adapter.descriptor.id, adapter);
    this.ensureSelections();
    return this;
  }

  snapshot(): ProviderDirectorySnapshot {
    this.ensureSelections();
    return {
      providers: Array.from(this.adapters.values())
        .map((adapter) => adapter.descriptor)
        .sort((a, b) => a.label.localeCompare(b.label)),
      selections: { ...this.selections },
    };
  }

  select(capability: ProviderCapability, providerId: string) {
    const adapter = this.adapters.get(providerId);
    if (!adapter) throw new Error(`Unknown provider: ${providerId}`);
    if (!adapter.descriptor.configured) {
      throw new Error(`Provider ${providerId} is not configured.`);
    }
    if (!supports(adapter, capability)) {
      throw new Error(`Provider ${providerId} does not support ${capability}.`);
    }
    this.selections[capability] = providerId;
    return this.snapshot();
  }

  route(capability: ProviderCapability, policy: RoutingPolicy): RoutingDecision {
    const candidates = Array.from(this.adapters.values())
      .filter((adapter) => adapter.descriptor.capabilities.includes(capability))
      .map((adapter) => ({
        id: adapter.descriptor.id,
        model: adapter.descriptor.models[capability]?.[0] ?? "default",
        quality: adapter.descriptor.routing?.quality ?? 50,
        latencyMs: adapter.descriptor.routing?.latencyMs ?? 5_000,
        costUsd: adapter.descriptor.routing?.estimatedCostUsd[capability] ?? 0,
        configured: adapter.descriptor.configured && supports(adapter, capability),
      }));
    const decision = routeProvider(candidates, policy);
    this.select(capability, decision.provider);
    return decision;
  }

  selected(capability: ProviderCapability) {
    this.ensureSelections();
    const id = this.selections[capability];
    const adapter = this.adapters.get(id);
    if (!adapter) throw new Error(`No provider selected for ${capability}.`);
    return adapter;
  }

  generateImage(input: ImageGenerateInput) {
    const adapter = this.selected("image");
    if (!adapter.image) throw new Error("Selected provider has no image capability.");
    return adapter.image.generate(input);
  }

  editImage(input: ImageEditInput) {
    const adapter = this.selected("image");
    if (!adapter.image?.edit) {
      throw new Error("Selected provider does not support image editing.");
    }
    return adapter.image.edit(input);
  }

  generateVideo(input: VideoGenerateInput) {
    const adapter = this.selected("video");
    if (!adapter.video) throw new Error("Selected provider has no video capability.");
    return adapter.video.generate(input);
  }

  synthesizeVoice(input: VoiceSynthesizeInput) {
    const adapter = this.selected("voice");
    if (!adapter.voice) throw new Error("Selected provider has no voice capability.");
    return adapter.voice.synthesize(input);
  }

  private ensureSelections() {
    for (const capability of ["image", "video", "voice"] as const) {
      const current = this.adapters.get(this.selections[capability]);
      if (current?.descriptor.configured && supports(current, capability)) continue;

      const fallback = Array.from(this.adapters.values()).find(
        (adapter) => adapter.descriptor.configured && supports(adapter, capability)
      );
      this.selections[capability] = fallback?.descriptor.id ?? "";
    }
  }
}

function supports(adapter: ProviderAdapter, capability: ProviderCapability) {
  if (!adapter.descriptor.capabilities.includes(capability)) return false;
  if (capability === "image") return Boolean(adapter.image);
  if (capability === "video") return Boolean(adapter.video);
  return Boolean(adapter.voice);
}
