import type { CaptionStyleConfig } from "./captions";

export type BrandKit = {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  headingFont: string;
  bodyFont: string;
  headingWeight: number;
  bodyWeight: number;
  safeZone: number;
  captionFontSize: number;
  captionMaxWidth: number;
  logoDataUrl: string | null;
  logoName: string | null;
  logoWidth: number;
  logoX: number;
  logoY: number;
};

export const DEFAULT_BRAND_KIT: BrandKit = {
  name: "NEMDAR Brand",
  primaryColor: "#09254B",
  secondaryColor: "#168BF1",
  headingFont: "Cairo, sans-serif",
  bodyFont: "Roboto, sans-serif",
  headingWeight: 800,
  bodyWeight: 500,
  safeZone: 8,
  captionFontSize: 28,
  captionMaxWidth: 82,
  logoDataUrl: null,
  logoName: null,
  logoWidth: 18,
  logoX: 88,
  logoY: 10,
};

export function normalizeBrandKit(
  brand?: Partial<BrandKit> | null
): BrandKit {
  const base = DEFAULT_BRAND_KIT;
  return {
    ...base,
    ...brand,
    name: (brand?.name ?? base.name).trim() || base.name,
    primaryColor: normalizeHex(brand?.primaryColor ?? base.primaryColor),
    secondaryColor: normalizeHex(brand?.secondaryColor ?? base.secondaryColor),
    headingFont: (brand?.headingFont ?? base.headingFont).trim() || base.headingFont,
    bodyFont: (brand?.bodyFont ?? base.bodyFont).trim() || base.bodyFont,
    headingWeight: clamp(Math.round(Number(brand?.headingWeight ?? base.headingWeight)), 400, 900),
    bodyWeight: clamp(Math.round(Number(brand?.bodyWeight ?? base.bodyWeight)), 400, 900),
    safeZone: clamp(Number(brand?.safeZone ?? base.safeZone), 0, 25),
    captionFontSize: clamp(Number(brand?.captionFontSize ?? base.captionFontSize), 14, 64),
    captionMaxWidth: clamp(Number(brand?.captionMaxWidth ?? base.captionMaxWidth), 40, 96),
    logoDataUrl: brand?.logoDataUrl ?? null,
    logoName: brand?.logoName ?? null,
    logoWidth: clamp(Number(brand?.logoWidth ?? base.logoWidth), 5, 45),
    logoX: clamp(Number(brand?.logoX ?? base.logoX), 0, 100),
    logoY: clamp(Number(brand?.logoY ?? base.logoY), 0, 100),
  };
}

export function brandCaptionDefaults(
  brand: BrandKit,
  current: CaptionStyleConfig
): CaptionStyleConfig {
  return {
    ...current,
    fontSize: brand.captionFontSize,
    fontWeight: clampCaptionWeight(brand.headingWeight),
    fontFamily: brand.headingFont,
    textColor: "#ffffff",
    backgroundColor: brand.primaryColor,
    safeZone: brand.safeZone,
    maxWidth: brand.captionMaxWidth,
  };
}

function clampCaptionWeight(value: number): CaptionStyleConfig["fontWeight"] {
  const allowed = [400, 500, 600, 700, 800, 900] as const;
  return allowed.reduce((best, candidate) =>
    Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best
  , 700 as CaptionStyleConfig["fontWeight"]);
}

function normalizeHex(value: string) {
  const candidate = value.trim();
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toUpperCase() : "#09254B";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
