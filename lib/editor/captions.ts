export type CaptionLanguage = "auto" | "ar" | "en" | string;

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
