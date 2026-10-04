export type MarketingPlatform =
  | "instagram-reels"
  | "instagram-feed"
  | "tiktok"
  | "youtube-shorts"
  | "linkedin"
  | "x"
  | "snapchat";

export type MarketingLanguage = "ar" | "en";

export type MarketingBrief = {
  id: string;
  product: string;
  audience: string;
  objective: string;
  offer: string;
  platforms: MarketingPlatform[];
  languages: MarketingLanguage[];
  tone: string;
  cta: string;
  requiredClaims: string[];
  prohibitedClaims: string[];
  constraints: string;
  updatedAt: number;
};

export const EMPTY_MARKETING_BRIEF: MarketingBrief = {
  id: "primary-brief",
  product: "",
  audience: "",
  objective: "",
  offer: "",
  platforms: ["instagram-reels"],
  languages: ["ar"],
  tone: "Premium, clear, confident",
  cta: "",
  requiredClaims: [],
  prohibitedClaims: [],
  constraints: "Do not invent clients, prices, ROI, awards, availability, guarantees or unsupported claims.",
  updatedAt: 0,
};

export type BriefValidation = {
  ready: boolean;
  missing: string[];
  warnings: string[];
};

export function normalizeMarketingBrief(
  input?: Partial<MarketingBrief> | null
): MarketingBrief {
  const base = EMPTY_MARKETING_BRIEF;
  return {
    ...base,
    ...input,
    id: input?.id?.trim() || base.id,
    product: input?.product?.trim() ?? base.product,
    audience: input?.audience?.trim() ?? base.audience,
    objective: input?.objective?.trim() ?? base.objective,
    offer: input?.offer?.trim() ?? base.offer,
    tone: input?.tone?.trim() || base.tone,
    cta: input?.cta?.trim() ?? base.cta,
    constraints: input?.constraints?.trim() || base.constraints,
    platforms: unique(input?.platforms?.length ? input.platforms : base.platforms),
    languages: unique(input?.languages?.length ? input.languages : base.languages),
    requiredClaims: cleanLines(input?.requiredClaims ?? base.requiredClaims),
    prohibitedClaims: cleanLines(input?.prohibitedClaims ?? base.prohibitedClaims),
    updatedAt: Number(input?.updatedAt ?? base.updatedAt) || 0,
  };
}

export function validateMarketingBrief(brief: MarketingBrief): BriefValidation {
  const missing: string[] = [];
  if (!brief.product) missing.push("product");
  if (!brief.audience) missing.push("audience");
  if (!brief.objective) missing.push("objective");
  if (!brief.cta) missing.push("CTA");
  if (!brief.platforms.length) missing.push("platform");
  if (!brief.languages.length) missing.push("language");

  const warnings: string[] = [];
  if (!brief.offer) warnings.push("No explicit offer is defined.");
  if (!brief.requiredClaims.length) warnings.push("No approved factual claims are supplied.");

  return { ready: missing.length === 0, missing, warnings };
}

export function briefToPromptContext(brief: MarketingBrief) {
  return [
    `Product: ${brief.product || "Not supplied"}`,
    `Audience: ${brief.audience || "Not supplied"}`,
    `Objective: ${brief.objective || "Not supplied"}`,
    `Offer: ${brief.offer || "No offer supplied"}`,
    `Platforms: ${brief.platforms.join(", ")}`,
    `Languages: ${brief.languages.join(", ")}`,
    `Tone: ${brief.tone}`,
    `CTA: ${brief.cta || "Not supplied"}`,
    `Approved claims: ${brief.requiredClaims.join(" | ") || "None supplied"}`,
    `Never claim: ${brief.prohibitedClaims.join(" | ") || "None supplied"}`,
    `Constraints: ${brief.constraints}`,
  ].join("\n");
}

function cleanLines(values: string[]) {
  return unique(values.map((value) => value.trim()).filter(Boolean));
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}
