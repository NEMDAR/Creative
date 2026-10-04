import type { CreatorProject, RatioKey } from "../editor/types";
import type { CreativeConcept } from "./brief";

export type CampaignVariant = {
  id: string;
  masterProjectName: string;
  name: string;
  platform: "reels" | "feed" | "portrait" | "landscape";
  ratio: RatioKey;
  hook: string;
  cta: string;
  project: CreatorProject;
  createdAt: number;
};

const VARIANT_SPECS: Array<Pick<CampaignVariant, "platform" | "ratio" | "name">> = [
  { platform: "reels", ratio: "9:16", name: "Reels / TikTok" },
  { platform: "feed", ratio: "1:1", name: "Square Feed" },
  { platform: "portrait", ratio: "4:5", name: "Portrait Feed" },
  { platform: "landscape", ratio: "16:9", name: "Landscape / LinkedIn" },
];

export function buildCampaignVariants(
  master: CreatorProject,
  concept: CreativeConcept | null
): CampaignVariant[] {
  const now = Date.now();
  return VARIANT_SPECS.map((spec) => {
    const hook =
      spec.ratio === "16:9"
        ? concept?.title ?? concept?.hook ?? "Campaign"
        : concept?.hook ?? "Campaign";
    const cta = concept?.cta ?? "Learn more";

    const project: CreatorProject = {
      ...structuredClone(master),
      name: `${master.name} — ${spec.name}`,
      ratio: spec.ratio,
      overlays: master.overlays.map((overlay) => {
        if (overlay.kind !== "text") return overlay;
        const text = overlay.text.trim();
        if (!text) return overlay;
        if (text === concept?.hook) {
          return {
            ...overlay,
            text: hook,
            fontSize:
              spec.ratio === "16:9"
                ? Math.max(24, Math.round(overlay.fontSize * 0.78))
                : overlay.fontSize,
          };
        }
        if (text === concept?.cta) {
          return { ...overlay, text: cta };
        }
        return overlay;
      }),
    };

    return {
      id: crypto.randomUUID(),
      masterProjectName: master.name,
      name: spec.name,
      platform: spec.platform,
      ratio: spec.ratio,
      hook,
      cta,
      project,
      createdAt: now,
    };
  });
}
