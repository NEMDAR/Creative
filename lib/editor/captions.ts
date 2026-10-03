export type CaptionLanguage = "auto" | "ar" | "en" | string;
export type CaptionPresetId = "clean" | "bold" | "boxed" | "minimal";
export type CaptionPosition = "top" | "center" | "bottom";
export type CaptionEmphasis = "none" | "bold" | "highlight";

export type CaptionCue = {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  language: string;
};

export type CaptionTrack = {
  provider: string;
  model: string;
  requestedLanguage: CaptionLanguage;
  detectedLanguage: string;
  generatedAt: number;
  cues: CaptionCue[];
};

export type CaptionStyleConfig = {
  presetId: CaptionPresetId;
  fontSize: number;
  fontWeight: 400 | 500 | 600 | 700 | 800 | 900;
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  position: CaptionPosition;
  safeZone: number;
  maxWidth: number;
  emphasis: CaptionEmphasis;
  shadow: boolean;
};

export const CAPTION_STYLE_PRESETS: Record<CaptionPresetId, CaptionStyleConfig> = {
  clean: {
    presetId: "clean",
    fontSize: 26,
    fontWeight: 700,
    fontFamily: "Arial, sans-serif",
    textColor: "#ffffff",
    backgroundColor: "#000000",
    backgroundOpacity: 0.58,
    position: "bottom",
    safeZone: 8,
    maxWidth: 82,
    emphasis: "none",
    shadow: true,
  },
  bold: {
    presetId: "bold",
    fontSize: 32,
    fontWeight: 900,
    fontFamily: "Arial, sans-serif",
    textColor: "#ffffff",
    backgroundColor: "#168BF1",
    backgroundOpacity: 0.9,
    position: "bottom",
    safeZone: 8,
    maxWidth: 88,
    emphasis: "bold",
    shadow: false,
  },
  boxed: {
    presetId: "boxed",
    fontSize: 27,
    fontWeight: 800,
    fontFamily: "Arial, sans-serif",
    textColor: "#09254B",
    backgroundColor: "#F8F5F1",
    backgroundOpacity: 0.96,
    position: "bottom",
    safeZone: 8,
    maxWidth: 80,
    emphasis: "highlight",
    shadow: false,
  },
  minimal: {
    presetId: "minimal",
    fontSize: 23,
    fontWeight: 600,
    fontFamily: "Arial, sans-serif",
    textColor: "#ffffff",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    position: "bottom",
    safeZone: 10,
    maxWidth: 76,
    emphasis: "none",
    shadow: true,
  },
};

export function cloneCaptionStylePreset(
  presetId: CaptionPresetId
): CaptionStyleConfig {
  return { ...CAPTION_STYLE_PRESETS[presetId] };
}

export function normalizeCaptionStyle(
  style?: Partial<CaptionStyleConfig> | null
): CaptionStyleConfig {
  const presetId =
    style?.presetId && style.presetId in CAPTION_STYLE_PRESETS
      ? style.presetId
      : "clean";
  const base = CAPTION_STYLE_PRESETS[presetId];

  return {
    ...base,
    ...style,
    presetId,
    fontSize: clamp(Number(style?.fontSize ?? base.fontSize), 14, 64),
    fontFamily: (style?.fontFamily ?? base.fontFamily).trim() || base.fontFamily,
    backgroundOpacity: clamp(
      Number(style?.backgroundOpacity ?? base.backgroundOpacity),
      0,
      1
    ),
    safeZone: clamp(Number(style?.safeZone ?? base.safeZone), 0, 25),
    maxWidth: clamp(Number(style?.maxWidth ?? base.maxWidth), 40, 96),
  };
}

export function captionCueAtTime(
  track: CaptionTrack | null,
  time: number
): CaptionCue | null {
  if (!track) return null;
  return (
    track.cues.find(
      (cue) => time >= cue.startTime && time < cue.endTime
    ) ?? null
  );
}

export function normalizeCaptionTrack(track: CaptionTrack): CaptionTrack {
  const cues = track.cues
    .map((cue) => ({
      ...cue,
      startTime: Math.max(0, cue.startTime),
      endTime: Math.max(cue.startTime + 0.05, cue.endTime),
      text: cue.text.trim(),
      language: cue.language || track.detectedLanguage || "und",
    }))
    .filter((cue) => cue.text.length > 0)
    .sort((a, b) => a.startTime - b.startTime);

  return { ...track, cues };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
