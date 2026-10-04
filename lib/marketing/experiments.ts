import type { MarketingBrief } from "../editor/marketing";
import type { CreativeConcept } from "./brief";

export type CampaignLanguageVariant = {
  id: string;
  masterConceptId: string;
  language: "ar" | "en";
  direction: "rtl" | "ltr";
  hook: string;
  cta: string;
  script: string;
  reviewRequired: boolean;
  createdAt: number;
};

export type CampaignExperiment = {
  id: string;
  masterConceptId: string;
  index: number;
  hook: string;
  cta: string;
  rationale: string;
  createdAt: number;
};

const CTA_AR: Record<string, string> = {
  "request a demo": "اطلب عرضًا توضيحيًا",
  "book a demo": "احجز عرضًا توضيحيًا",
  "learn more": "اعرف المزيد",
  "enquire now": "استفسر الآن",
};

export function buildLanguageVariants(
  concept: CreativeConcept,
  brief: MarketingBrief
): CampaignLanguageVariant[] {
  const now = Date.now();
  const variants: CampaignLanguageVariant[] = [];

  if (brief.languages.includes("en")) {
    variants.push({
      id: crypto.randomUUID(),
      masterConceptId: concept.id,
      language: "en",
      direction: "ltr",
      hook: concept.hook,
      cta: concept.cta,
      script: concept.script,
      reviewRequired: false,
      createdAt: now,
    });
  }

  if (brief.languages.includes("ar")) {
    const ctaKey = concept.cta.trim().toLowerCase();
    const localizedCta = CTA_AR[ctaKey] ?? concept.cta;
    const hook = `اكتشف ${brief.product} المصمم لـ ${brief.audience}.`;
    const approvedClaims = brief.requiredClaims.join(" ");
    const script = [
      hook,
      approvedClaims,
      brief.offer ? `العرض المعتمد: ${brief.offer}.` : "",
      localizedCta,
    ].filter(Boolean).join(" ");

    variants.push({
      id: crypto.randomUUID(),
      masterConceptId: concept.id,
      language: "ar",
      direction: "rtl",
      hook,
      cta: localizedCta,
      script,
      reviewRequired: true,
      createdAt: now,
    });
  }

  return variants;
}

export function buildBoundedExperiments(
  concept: CreativeConcept
): CampaignExperiment[] {
  const now = Date.now();
  return [
    {
      id: crypto.randomUUID(),
      masterConceptId: concept.id,
      index: 1,
      hook: concept.hook,
      cta: concept.cta,
      rationale: "Control — preserves the selected master concept.",
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      masterConceptId: concept.id,
      index: 2,
      hook: `Quick take: ${concept.hook}`,
      cta: concept.cta,
      rationale: "Hook experiment — stronger short-form opening, same CTA.",
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      masterConceptId: concept.id,
      index: 3,
      hook: concept.hook,
      cta: concept.cta.toLowerCase().includes("now")
        ? concept.cta
        : `${concept.cta} now`,
      rationale: "CTA experiment — same message with a more immediate action.",
      createdAt: now,
    },
  ];
}
