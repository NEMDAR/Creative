export type TimelineClipKind = "video" | "image";
export type ClipFitMode = "cover" | "contain" | "fill";
export type TransitionType = "none" | "fade" | "crossfade";

export type ClipTransform = {
  fit: ClipFitMode;
  cropX: number;
  cropY: number;
  zoom: number;
  rotation: number;
  speed: number;
};

export type ClipChromaKey = {
  enabled: boolean;
  keyColor: string;
  tolerance: number;
  spill: number;
  backgroundColor: string;
};

export const DEFAULT_CLIP_CHROMA: ClipChromaKey = {
  enabled: false,
  keyColor: "#00FF00",
  tolerance: 0.22,
  spill: 0.35,
  backgroundColor: "#0B1020",
};

export function normalizeClipChroma(
  chroma?: Partial<ClipChromaKey> | null
): ClipChromaKey {
  return {
    enabled: Boolean(chroma?.enabled),
    keyColor: normalizeHex(chroma?.keyColor ?? DEFAULT_CLIP_CHROMA.keyColor),
    tolerance: clamp(chroma?.tolerance ?? DEFAULT_CLIP_CHROMA.tolerance, 0.01, 1),
    spill: clamp(chroma?.spill ?? DEFAULT_CLIP_CHROMA.spill, 0, 1),
    backgroundColor: normalizeHex(
      chroma?.backgroundColor ?? DEFAULT_CLIP_CHROMA.backgroundColor
    ),
  };
}

export type ClipTransition = {
  type: Exclude<TransitionType, "none">;
  duration: number;
};

export type TimelineClip = {
  id: string;
  assetId: string;
  assetName: string;
  kind: TimelineClipKind;
  timelineStart: number;
  sourceStart: number;
  duration: number;
  sourceDuration: number | null;
  transitionOut: ClipTransition | null;
  transform: ClipTransform;
  chroma: ClipChromaKey;
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
      transitionOut: null,
      transform: {
        fit: "cover",
        cropX: 50,
        cropY: 50,
        zoom: 1,
        rotation: 0,
        speed: 1,
      },
      chroma: { ...DEFAULT_CLIP_CHROMA },
    };
    cursor += duration;
    return clip;
  });

  return reflowTimeline(
    {
      schemaVersion: 1,
      playhead,
      duration: cursor,
      tracks: [{ id: "visual-1", kind: "visual", clips }],
    },
    clips,
    playhead
  );
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
    sourceTime:
      clip.sourceStart +
      (clamped - clip.timelineStart) * clip.transform.speed,
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
  return timelineTimeForClip(timeline, clip.id, sourceTime);
}

export function timelineTimeForClip(
  timeline: TimelineState,
  clipId: string,
  sourceTime: number
): number | null {
  const clip = timeline.tracks[0]?.clips.find((item) => item.id === clipId);
  if (!clip) return null;
  return clamp(
    clip.timelineStart +
      (sourceTime - clip.sourceStart) / Math.max(0.01, clip.transform.speed),
    clip.timelineStart,
    clip.timelineStart + clip.duration
  );
}

export function trimTimelineClip(
  timeline: TimelineState,
  clipId: string,
  sourceStart: number,
  duration: number
): TimelineState {
  const clips = timeline.tracks[0]?.clips ?? [];
  const next = clips.map((clip) => {
    if (clip.id !== clipId) return clip;

    if (clip.kind === "image") {
      return {
        ...clip,
        sourceStart: 0,
        duration: Math.max(0.1, duration),
      };
    }

    const maxSource = clip.sourceDuration ?? Number.POSITIVE_INFINITY;
    const nextStart = clamp(sourceStart, 0, Math.max(0, maxSource - 0.1));
    const speed = Math.max(0.01, clip.transform.speed);
    const maxDuration = Math.max(0.1, (maxSource - nextStart) / speed);
    return {
      ...clip,
      sourceStart: nextStart,
      duration: clamp(duration, 0.1, maxDuration),
    };
  });

  return reflowTimeline(timeline, next);
}

export function splitTimelineClip(
  timeline: TimelineState,
  clipId: string,
  offset: number,
  rightClipId: string
): TimelineState {
  const clips = timeline.tracks[0]?.clips ?? [];
  const index = clips.findIndex((clip) => clip.id === clipId);
  if (index < 0) return timeline;

  const clip = clips[index];
  if (offset <= 0.05 || offset >= clip.duration - 0.05) return timeline;

  const left: TimelineClip = {
    ...clip,
    duration: offset,
    transitionOut: null,
  };
  const right: TimelineClip = {
    ...clip,
    id: rightClipId,
    sourceStart:
      clip.kind === "video"
        ? clip.sourceStart + offset * clip.transform.speed
        : clip.sourceStart,
    duration: clip.duration - offset,
    transitionOut: clip.transitionOut,
  };

  const next = [...clips];
  next.splice(index, 1, left, right);
  return reflowTimeline(timeline, next, clip.timelineStart + offset);
}

export function duplicateTimelineClip(
  timeline: TimelineState,
  clipId: string,
  newClipId: string
): TimelineState {
  const clips = timeline.tracks[0]?.clips ?? [];
  const index = clips.findIndex((clip) => clip.id === clipId);
  if (index < 0) return timeline;

  const copy: TimelineClip = {
    ...clips[index],
    id: newClipId,
  };
  const next = [...clips];
  next.splice(index + 1, 0, copy);
  return reflowTimeline(timeline, next);
}

export function deleteTimelineClip(
  timeline: TimelineState,
  clipId: string
): TimelineState {
  const clips = timeline.tracks[0]?.clips ?? [];
  const next = clips.filter((clip) => clip.id !== clipId);
  return reflowTimeline(timeline, next);
}

export function moveTimelineClip(
  timeline: TimelineState,
  clipId: string,
  direction: -1 | 1
): TimelineState {
  const clips = [...(timeline.tracks[0]?.clips ?? [])];
  const index = clips.findIndex((clip) => clip.id === clipId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= clips.length) return timeline;

  [clips[index], clips[target]] = [clips[target], clips[index]];
  return reflowTimeline(timeline, clips);
}

export function updateTimelineClipChroma(
  timeline: TimelineState,
  clipId: string,
  patch: Partial<ClipChromaKey>
): TimelineState {
  const clips = timeline.tracks[0]?.clips ?? [];
  const next = clips.map((clip) =>
    clip.id === clipId
      ? { ...clip, chroma: normalizeClipChroma({ ...clip.chroma, ...patch }) }
      : clip
  );
  return reflowTimeline(timeline, next);
}

export function updateTimelineClipTransform(
  timeline: TimelineState,
  clipId: string,
  patch: Partial<ClipTransform>
): TimelineState {
  const clips = timeline.tracks[0]?.clips ?? [];
  const next = clips.map((clip) => {
    if (clip.id !== clipId) return clip;

    const previousSpeed = Math.max(0.01, clip.transform.speed);
    const nextSpeed =
      clip.kind === "video"
        ? clamp(patch.speed ?? previousSpeed, 0.25, 4)
        : 1;
    const sourceSpan = clip.duration * previousSpeed;
    let nextDuration =
      clip.kind === "video" ? sourceSpan / nextSpeed : clip.duration;

    if (clip.kind === "video" && clip.sourceDuration !== null) {
      const remainingSource = Math.max(0.1, clip.sourceDuration - clip.sourceStart);
      nextDuration = Math.min(nextDuration, remainingSource / nextSpeed);
    }

    return {
      ...clip,
      duration: Math.max(0.1, nextDuration),
      transform: {
        fit: patch.fit ?? clip.transform.fit,
        cropX: clamp(patch.cropX ?? clip.transform.cropX, 0, 100),
        cropY: clamp(patch.cropY ?? clip.transform.cropY, 0, 100),
        zoom: clamp(patch.zoom ?? clip.transform.zoom, 1, 3),
        rotation: clamp(patch.rotation ?? clip.transform.rotation, -180, 180),
        speed: nextSpeed,
      },
    };
  });

  return reflowTimeline(timeline, next);
}

export function isCrossfadeEligible(
  outgoing: TimelineClip,
  incoming: TimelineClip | null
) {
  return Boolean(incoming && outgoing.kind === "image" && incoming.kind === "image");
}

export function getNextTimelineClip(
  timeline: TimelineState,
  clipId: string
): TimelineClip | null {
  const clips = timeline.tracks[0]?.clips ?? [];
  const index = clips.findIndex((clip) => clip.id === clipId);
  return index >= 0 ? clips[index + 1] ?? null : null;
}

export function getMaxTransitionDuration(
  outgoing: TimelineClip,
  incoming: TimelineClip | null
) {
  if (!incoming) return 0;
  return Math.max(0.1, Math.min(2, outgoing.duration / 2, incoming.duration / 2));
}

export function setTimelineClipTransition(
  timeline: TimelineState,
  clipId: string,
  type: TransitionType,
  duration: number
): TimelineState {
  const clips = timeline.tracks[0]?.clips ?? [];
  const index = clips.findIndex((clip) => clip.id === clipId);
  if (index < 0) return timeline;

  const outgoing = clips[index];
  const incoming = clips[index + 1] ?? null;
  if (!incoming || type === "none") {
    const next = clips.map((clip) =>
      clip.id === clipId ? { ...clip, transitionOut: null } : clip
    );
    return reflowTimeline(timeline, next);
  }

  if (type === "crossfade" && !isCrossfadeEligible(outgoing, incoming)) {
    return timeline;
  }

  const maxDuration = getMaxTransitionDuration(outgoing, incoming);
  const normalizedDuration = clamp(duration, 0.1, maxDuration);
  const transitionOut: ClipTransition = {
    type,
    duration: normalizedDuration,
  };
  const next = clips.map((clip) =>
    clip.id === clipId ? { ...clip, transitionOut } : clip
  );
  return reflowTimeline(timeline, next);
}

export type TransitionVisualState = {
  primaryClip: TimelineClip | null;
  primaryOpacity: number;
  secondaryClip: TimelineClip | null;
  secondaryOpacity: number;
  blackOpacity: number;
  type: TransitionType;
  progress: number;
};

export function getTransitionVisualState(
  timeline: TimelineState,
  timelineTime: number
): TransitionVisualState {
  const clips = timeline.tracks[0]?.clips ?? [];
  const resolved = resolveTimelineTime(timeline, timelineTime);
  if (!resolved) {
    return {
      primaryClip: null,
      primaryOpacity: 1,
      secondaryClip: null,
      secondaryOpacity: 0,
      blackOpacity: 0,
      type: "none",
      progress: 0,
    };
  }

  const current = resolved.clip;
  const index = clips.findIndex((clip) => clip.id === current.id);
  const next = clips[index + 1] ?? null;
  const previous = index > 0 ? clips[index - 1] : null;

  const outgoingTransition = current.transitionOut;
  if (outgoingTransition && next) {
    const transitionStart =
      current.timelineStart + current.duration - outgoingTransition.duration;
    if (timelineTime >= transitionStart) {
      const progress = clamp(
        (timelineTime - transitionStart) / outgoingTransition.duration,
        0,
        1
      );

      if (
        outgoingTransition.type === "crossfade" &&
        isCrossfadeEligible(current, next)
      ) {
        return {
          primaryClip: current,
          primaryOpacity: 1 - progress,
          secondaryClip: next,
          secondaryOpacity: progress,
          blackOpacity: 0,
          type: "crossfade",
          progress,
        };
      }

      return {
        primaryClip: current,
        primaryOpacity: 1 - progress,
        secondaryClip: null,
        secondaryOpacity: 0,
        blackOpacity: progress,
        type: "fade",
        progress,
      };
    }
  }

  const incomingTransition = previous?.transitionOut;
  if (incomingTransition?.type === "fade") {
    const elapsed = timelineTime - current.timelineStart;
    if (elapsed >= 0 && elapsed <= incomingTransition.duration) {
      const progress = clamp(elapsed / incomingTransition.duration, 0, 1);
      return {
        primaryClip: current,
        primaryOpacity: progress,
        secondaryClip: null,
        secondaryOpacity: 0,
        blackOpacity: 1 - progress,
        type: "fade",
        progress,
      };
    }
  }

  return {
    primaryClip: current,
    primaryOpacity: 1,
    secondaryClip: null,
    secondaryOpacity: 0,
    blackOpacity: 0,
    type: "none",
    progress: 0,
  };
}

export function removeTimelineRange(
  timeline: TimelineState,
  rangeStart: number,
  rangeEnd: number,
  rightClipId: string
): TimelineState {
  const start = clamp(Math.min(rangeStart, rangeEnd), 0, timeline.duration);
  const end = clamp(Math.max(rangeStart, rangeEnd), 0, timeline.duration);
  if (end - start < 0.05) return timeline;

  const clips = timeline.tracks[0]?.clips ?? [];
  const next: TimelineClip[] = [];
  let rightIdUsed = false;

  for (const clip of clips) {
    const clipStart = clip.timelineStart;
    const clipEnd = clip.timelineStart + clip.duration;

    if (clipEnd <= start || clipStart >= end) {
      next.push(clip);
      continue;
    }

    const overlapStart = Math.max(start, clipStart);
    const overlapEnd = Math.min(end, clipEnd);
    const leftDuration = Math.max(0, overlapStart - clipStart);
    const rightDuration = Math.max(0, clipEnd - overlapEnd);

    if (leftDuration >= 0.05) {
      next.push({
        ...clip,
        duration: leftDuration,
        transitionOut: rightDuration >= 0.05 ? null : clip.transitionOut,
      });
    }

    if (rightDuration >= 0.05) {
      const removedFromSource =
        (overlapEnd - clipStart) * Math.max(0.01, clip.transform.speed);
      next.push({
        ...clip,
        id: rightIdUsed ? `${rightClipId}-${next.length}` : rightClipId,
        sourceStart:
          clip.kind === "video"
            ? clip.sourceStart + removedFromSource
            : clip.sourceStart,
        duration: rightDuration,
        transitionOut: clip.transitionOut,
      });
      rightIdUsed = true;
    }
  }

  return reflowTimeline(timeline, next, start);
}

export function formatTimelineTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00.0";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainder
    .toFixed(1)
    .padStart(4, "0")}`;
}

function reflowTimeline(
  timeline: TimelineState,
  clips: TimelineClip[],
  playhead = timeline.playhead
): TimelineState {
  let cursor = 0;
  const positioned = clips.map((clip) => {
    const next = {
      ...clip,
      timelineStart: cursor,
      duration: Math.max(0.1, clip.duration),
      chroma: normalizeClipChroma(clip.chroma),
    };
    cursor += next.duration;
    return next;
  });

  const normalized = positioned.map((clip, index) => {
    const incoming = positioned[index + 1] ?? null;
    const transition = clip.transitionOut;
    if (!transition || !incoming) {
      return { ...clip, transitionOut: null };
    }

    if (
      transition.type === "crossfade" &&
      !isCrossfadeEligible(clip, incoming)
    ) {
      return { ...clip, transitionOut: null };
    }

    return {
      ...clip,
      transitionOut: {
        ...transition,
        duration: clamp(
          transition.duration,
          0.1,
          getMaxTransitionDuration(clip, incoming)
        ),
      },
    };
  });

  return {
    ...timeline,
    playhead: clamp(playhead, 0, cursor),
    duration: cursor,
    tracks: [{ id: "visual-1", kind: "visual", clips: normalized }],
  };
}

function normalizeHex(value: string) {
  const candidate = value.trim();
  return /^#[0-9a-f]{6}$/i.test(candidate)
    ? candidate.toUpperCase()
    : "#00FF00";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
