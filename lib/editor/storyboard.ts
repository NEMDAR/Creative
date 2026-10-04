export type StoryboardAssetNeed =
  | "existing"
  | "generate-image"
  | "generate-video"
  | "b-roll";

export type BrollOption = {
  rank: number;
  kind: "existing" | "generate-image" | "generate-video";
  label: string;
  prompt: string;
  assetName?: string;
};

export type StoryboardScene = {
  id: string;
  order: number;
  title: string;
  narration: string;
  visualPrompt: string;
  duration: number;
  assetNeed: StoryboardAssetNeed;
  broll: BrollOption[];
};

export type StoryboardPlan = {
  provider: string;
  model: string;
  brief: string;
  generatedAt: number;
  scenes: StoryboardScene[];
};

export type StoryboardAssetSummary = {
  name: string;
  kind: "image" | "video";
};

export function buildStoryboard(brief: string): StoryboardPlan {
  const normalized = brief.trim();
  const parts = normalized
    .split(/(?:\r?\n)+|(?<=[.!?؟])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 8);
  const scenes = (parts.length ? parts : [normalized || "Marketing opening"]).map(
    (part, index) => {
      const words = part.split(/\s+/).filter(Boolean).length;
      const duration = Math.max(3, Math.min(12, Math.round(words * 0.55)));
      return {
        id: `scene-${index + 1}-${crypto.randomUUID()}`,
        order: index + 1,
        title: `Scene ${index + 1}`,
        narration: part,
        visualPrompt: `Premium marketing shot illustrating: ${part}`,
        duration,
        assetNeed: index === 0 ? "generate-video" : "b-roll",
        broll: [],
      } satisfies StoryboardScene;
    }
  );

  return {
    provider: "nemdar-planner",
    model: "storyboard-v1",
    brief: normalized,
    generatedAt: Date.now(),
    scenes,
  };
}

export function addBrollSuggestions(
  plan: StoryboardPlan,
  assets: StoryboardAssetSummary[]
): StoryboardPlan {
  return {
    ...plan,
    scenes: plan.scenes.map((scene) => ({
      ...scene,
      broll: rankBroll(scene, assets),
    })),
  };
}

function rankBroll(
  scene: StoryboardScene,
  assets: StoryboardAssetSummary[]
): BrollOption[] {
  const existing = assets.slice(0, 2).map((asset, index) => ({
    rank: index + 1,
    kind: "existing" as const,
    label: `Use existing ${asset.kind}: ${asset.name}`,
    prompt: scene.visualPrompt,
    assetName: asset.name,
  }));

  const baseRank = existing.length + 1;
  return [
    ...existing,
    {
      rank: baseRank,
      kind: "generate-video",
      label: "Generate cinematic B-roll",
      prompt: `${scene.visualPrompt}. Cinematic movement, clean commercial lighting, no text.`,
    },
    {
      rank: baseRank + 1,
      kind: "generate-image",
      label: "Generate still B-roll",
      prompt: `${scene.visualPrompt}. Premium advertising still, clean composition, no text.`,
    },
  ];
}
