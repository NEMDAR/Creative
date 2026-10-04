import type { BrandKit } from "../editor/brand-kit";
import type { CaptionTrack } from "../editor/captions";
import type { MarketingBrief } from "../editor/marketing";
import type { CreatorProject } from "../editor/types";

export type BrandGuardianIssue = {
  id: string;
  severity: "error" | "warning";
  code:
    | "font"
    | "color"
    | "safe-zone"
    | "logo"
    | "cta"
    | "claim";
  message: string;
  overlayId?: string;
};

export type BrandGuardianResult = {
  status: "pass" | "blocked";
  issues: BrandGuardianIssue[];
  errors: number;
  warnings: number;
};

const GENERIC_RISK_PHRASES = [
  "guaranteed roi",
  "guaranteed return",
  "number one",
  "#1",
  "best in the uae",
];

export function runBrandGuardian(input: {
  project: CreatorProject;
  brandKit: BrandKit;
  brief: MarketingBrief;
  captions: CaptionTrack | null;
}): BrandGuardianResult {
  const { project, brandKit, brief, captions } = input;
  const issues: BrandGuardianIssue[] = [];
  const allowedFonts = new Set([
    normalizeFont(brandKit.headingFont),
    normalizeFont(brandKit.bodyFont),
  ]);
  const allowedColors = new Set([
    normalizeColor(brandKit.primaryColor),
    normalizeColor(brandKit.secondaryColor),
    "#FFFFFF",
    "#F8F5F1",
  ]);

  for (const overlay of project.overlays) {
    if (overlay.kind !== "text") continue;

    if (!allowedFonts.has(normalizeFont(overlay.fontFamily ?? ""))) {
      issues.push({
        id: crypto.randomUUID(),
        severity: "warning",
        code: "font",
        overlayId: overlay.id,
        message: `Off-brand font on text: ${overlay.fontFamily ?? "unspecified"}.`,
      });
    }

    if (!allowedColors.has(normalizeColor(overlay.color))) {
      issues.push({
        id: crypto.randomUUID(),
        severity: "warning",
        code: "color",
        overlayId: overlay.id,
        message: `Off-brand text color: ${overlay.color}.`,
      });
    }

    const min = brandKit.safeZone;
    const max = 100 - brandKit.safeZone;
    if (overlay.x < min || overlay.x > max || overlay.y < min || overlay.y > max) {
      issues.push({
        id: crypto.randomUUID(),
        severity: "warning",
        code: "safe-zone",
        overlayId: overlay.id,
        message: `Text is outside the ${brandKit.safeZone}% brand safe zone.`,
      });
    }
  }

  if (brandKit.logoDataUrl) {
    const approvedLogoPresent = project.overlays.some(
      (overlay) =>
        overlay.kind === "image" &&
        (overlay.id === "brand-kit-logo" || overlay.src === brandKit.logoDataUrl)
    );
    if (!approvedLogoPresent) {
      issues.push({
        id: crypto.randomUUID(),
        severity: "error",
        code: "logo",
        message: "Approved Brand Kit logo is missing from the creative.",
      });
    }
  }

  const content = [
    ...project.overlays
      .filter((overlay) => overlay.kind === "text")
      .map((overlay) => overlay.text),
    ...(captions?.cues.map((cue) => cue.text) ?? []),
  ].join(" ").toLowerCase();

  if (brief.cta && !content.includes(brief.cta.toLowerCase())) {
    issues.push({
      id: crypto.randomUUID(),
      severity: "error",
      code: "cta",
      message: `Required CTA is missing: "${brief.cta}".`,
    });
  }

  const prohibited = [
    ...brief.prohibitedClaims,
    ...GENERIC_RISK_PHRASES.filter(
      (risk) => !brief.requiredClaims.some((claim) => claim.toLowerCase().includes(risk))
    ),
  ];

  for (const claim of unique(prohibited)) {
    const normalized = claim.trim().toLowerCase();
    if (!normalized || !content.includes(normalized)) continue;
    issues.push({
      id: crypto.randomUUID(),
      severity: "error",
      code: "claim",
      message: `Unsafe or prohibited claim detected: "${claim}".`,
    });
  }

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;
  return {
    status: errors > 0 ? "blocked" : "pass",
    issues,
    errors,
    warnings,
  };
}

function normalizeFont(value: string) {
  return value.toLowerCase().replace(/["']/g, "").replace(/\s+/g, " ").trim();
}

function normalizeColor(value: string) {
  const raw = value.trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(raw)) return raw;
  return raw;
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
