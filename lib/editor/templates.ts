import { brandCaptionDefaults, normalizeBrandKit, type BrandKit } from "./brand-kit";
import { cloneCaptionStylePreset, normalizeCaptionStyle, type CaptionStyleConfig } from "./captions";
import type { CreatorProject, Overlay, RatioKey } from "./types";

export type MarketingTemplateId =
  | "product-spotlight"
  | "offer-stack"
  | "testimonial";

export type MarketingTemplateDefinition = {
  id: MarketingTemplateId;
  name: string;
  description: string;
  ratio: RatioKey;
  headline: string;
  body: string;
  cta: string;
};

export const MARKETING_TEMPLATES: MarketingTemplateDefinition[] = [
  {
    id: "product-spotlight",
    name: "Product Spotlight",
    description: "9:16 launch/reel with headline, supporting copy and CTA.",
    ratio: "9:16",
    headline: "YOUR MAIN HOOK",
    body: "Add one clear benefit or proof point here.",
    cta: "LEARN MORE",
  },
  {
    id: "offer-stack",
    name: "Offer Stack",
    description: "1:1 social offer layout for a concise promotion.",
    ratio: "1:1",
    headline: "LIMITED OFFER",
    body: "State the offer, value and important condition.",
    cta: "GET THE OFFER",
  },
  {
    id: "testimonial",
    name: "Testimonial",
    description: "4:5 testimonial/story layout with quote and attribution.",
    ratio: "4:5",
    headline: "“ADD THE CUSTOMER QUOTE HERE”",
    body: "Customer Name · Role / Company",
    cta: "SEE THE STORY",
  },
];

export type InstantiatedMarketingTemplate = {
  definition: MarketingTemplateDefinition;
  project: CreatorProject;
  captionStyle: CaptionStyleConfig;
};

export function instantiateMarketingTemplate(
  id: MarketingTemplateId,
  brandInput: BrandKit
): InstantiatedMarketingTemplate {
  const brand = normalizeBrandKit(brandInput);
  const definition =
    MARKETING_TEMPLATES.find((item) => item.id === id) ??
    MARKETING_TEMPLATES[0];

  const safe = brand.safeZone;
  const overlays: Overlay[] = [
    {
      id: "template-headline",
      kind: "text",
      text: definition.headline,
      x: 50,
      y: Math.max(safe + 5, 18),
      fontSize: definition.ratio === "9:16" ? 54 : 46,
      fontWeight: brand.headingWeight,
      fontFamily: brand.headingFont,
      color: brand.secondaryColor,
      opacity: 1,
      align: "center",
      direction: "ltr",
      startTime: 0,
      endTime: null,
    },
    {
      id: "template-body",
      kind: "text",
      text: definition.body,
      x: 50,
      y: 48,
      fontSize: definition.ratio === "9:16" ? 30 : 27,
      fontWeight: brand.bodyWeight,
      fontFamily: brand.bodyFont,
      color: "#ffffff",
      opacity: 1,
      align: "center",
      direction: "ltr",
      startTime: 0,
      endTime: null,
    },
    {
      id: "template-cta",
      kind: "text",
      text: definition.cta,
      x: 50,
      y: Math.min(100 - safe - 5, 82),
      fontSize: 28,
      fontWeight: brand.headingWeight,
      fontFamily: brand.headingFont,
      color: brand.primaryColor,
      opacity: 1,
      align: "center",
      direction: "ltr",
      startTime: 0,
      endTime: null,
    },
  ];

  if (brand.logoDataUrl) {
    overlays.push({
      id: "brand-kit-logo",
      kind: "image",
      src: brand.logoDataUrl,
      x: brand.logoX,
      y: brand.logoY,
      width: brand.logoWidth,
      opacity: 1,
      startTime: 0,
      endTime: null,
    });
  }

  const baseCaption = cloneCaptionStylePreset("clean");
  const captionStyle = normalizeCaptionStyle(
    brandCaptionDefaults(brand, baseCaption)
  );

  return {
    definition,
    project: {
      schemaVersion: 1,
      name: `${brand.name} — ${definition.name}`,
      ratio: definition.ratio,
      trimStart: 0,
      trimEnd: null,
      volume: 1,
      muted: false,
      overlays,
    },
    captionStyle,
  };
}
