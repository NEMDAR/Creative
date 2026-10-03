export type TimelineClipKind = "video" | "image";

export type TimelineClip = {
  id: string;
  assetId: string;
  assetName: string;
  kind: TimelineClipKind;
  timelineStart: number;
  sourceStart: number;
  duration: number;
  sourceDuration: number | null;
};

export type TimelineTrack = {
  id: string;
  kind: "visual";
  clips: TimelineClip[];
};

export type TimelineState = {
  schemaVersion: 1;
  playhead: number;
  duration: number;
  tracks: TimelineTrack[];
};

export type TimelineSourceInput = {
  assetId: string;
  assetName: string;
  kind: TimelineClipKind;
  sourceStart?: number;
  duration: number;
  sourceDuration?: number | null;
};

export function createEmptyTimeline(): TimelineState {
  return {
    schemaVersion: 1,
    playhead: 0,
    duration: 0,
    tracks: [{ id: "visual-1", kind: "visual", clips: [] }],
  };
}

export function buildSingleClipTimeline(input: {
  assetId?: string;
  assetName: string;
  kind: TimelineClipKind;
  sourceStart?: number;
  duration: number;
  sourceDuration?: number | null;
  playhead?: number;
}): TimelineState {
  return buildSequentialTimeline(
    [
      {
        assetId: input.assetId ?? "asset-primary",
        assetName: input.assetName,
        kind: input.kind,
        sourceStart: input.sourceStart,
        duration: input.duration,
        sourceDuration: input.sourceDuration,
      },
    ],
    input.playhead
  );
}

export function buildSequentialTimeline(
  inputs: TimelineSourceInput[],
  playhead = 0
): TimelineState {
  let cursor = 0;
  const clips = inputs.map((input, index) => {
    const duration = Math.max(0, input.duration);
    const clip: TimelineClip = {
      id: `clip-${input.assetId || index}`,
      assetId: input.assetId,
      assetName: input.assetName,
      kind: input.kind,
      timelineStart: cursor,
      sourceStart: Math.max(0, input.sourceStart ?? 0),
      duration,
      sourceDuration: input.sourceDuration ?? null,
    };
    cursor += duration;
    return clip;
  });

  return {
    schemaVersion: 1,
    playhead: clamp(playhead, 0, cursor),
    duration: cursor,
    tracks: [{ id: "visual-1", kind: "visual", clips }],
  };
}

export function setTimelinePlayhead(
  timeline: TimelineState,
  playhead: number
): TimelineState {
  return {
    ...timeline,
    playhead: clamp(playhead, 0, timeline.duration),
  };
}

export function resolveTimelineTime(
  timeline: TimelineState,
  timelineTime: number
): { clip: TimelineClip; sourceTime: number } | null {
  const track = timeline.tracks[0];
  if (!track) return null;

  const clamped = clamp(timelineTime, 0, timeline.duration);
  const clip = track.clips.find((item, index) => {
    const end = item.timelineStart + item.duration;
    const isLast = index === track.clips.length - 1;
    return clamped >= item.timelineStart && (clamped < end || (isLast && clamped <= end));
  });

  if (!clip) return null;
  return {
    clip,
    sourceTime: clip.sourceStart + (clamped - clip.timelineStart),
  };
}

export function timelineToSourceTime(
  timeline: TimelineState,
  timelineTime: number
): number | null {
  return resolveTimelineTime(timeline, timelineTime)?.sourceTime ?? null;
}

export function timelineTimeForSource(
  timeline: TimelineState,
  assetId: string,
  sourceTime: number
): number | null {
  const clip = timeline.tracks[0]?.clips.find((item) => item.assetId === assetId);
  if (!clip) return null;
  return clamp(
    clip.timelineStart + (sourceTime - clip.sourceStart),
    clip.timelineStart,
    clip.timelineStart + clip.duration
  );
}

export function formatTimelineTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00.0";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainder
    .toFixed(1)
    .padStart(4, "0")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
