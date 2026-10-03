export type TimelineClipKind = "video" | "image";

export type TimelineClip = {
  id: string;
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

export function createEmptyTimeline(): TimelineState {
  return {
    schemaVersion: 1,
    playhead: 0,
    duration: 0,
    tracks: [{ id: "visual-1", kind: "visual", clips: [] }],
  };
}

export function buildSingleClipTimeline(input: {
  assetName: string;
  kind: TimelineClipKind;
  sourceStart?: number;
  duration: number;
  sourceDuration?: number | null;
  playhead?: number;
}): TimelineState {
  const duration = Math.max(0, input.duration);
  const playhead = clamp(input.playhead ?? 0, 0, duration);

  return {
    schemaVersion: 1,
    playhead,
    duration,
    tracks: [
      {
        id: "visual-1",
        kind: "visual",
        clips: [
          {
            id: "clip-primary",
            assetName: input.assetName,
            kind: input.kind,
            timelineStart: 0,
            sourceStart: Math.max(0, input.sourceStart ?? 0),
            duration,
            sourceDuration: input.sourceDuration ?? null,
          },
        ],
      },
    ],
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

export function timelineToSourceTime(
  timeline: TimelineState,
  timelineTime: number
): number | null {
  const track = timeline.tracks[0];
  if (!track) return null;

  const clip = track.clips.find(
    (item) =>
      timelineTime >= item.timelineStart &&
      timelineTime <= item.timelineStart + item.duration
  );

  if (!clip) return null;
  return clip.sourceStart + (timelineTime - clip.timelineStart);
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
