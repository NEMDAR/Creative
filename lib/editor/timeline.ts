export type TimelineAssetKind = "video" | "image";

export type TimelineClip = {
  id: string;
  assetId: string;
  kind: TimelineAssetKind;
  name: string;
  timelineStart: number;
  sourceStart: number;
  sourceEnd: number;
  duration: number;
};

export type TimelineComposition = {
  schemaVersion: 2;
  playhead: number;
  clips: TimelineClip[];
};

const MIN_CLIP_DURATION = 0.05;

export function clipDuration(clip: Pick<TimelineClip, "sourceStart" | "sourceEnd">) {
  return Math.max(MIN_CLIP_DURATION, clip.sourceEnd - clip.sourceStart);
}

export function reflowTimeline(clips: TimelineClip[]): TimelineClip[] {
  let cursor = 0;
  return clips.map((clip) => {
    const duration = clipDuration(clip);
    const next = {
      ...clip,
      timelineStart: cursor,
      duration,
    };
    cursor += duration;
    return next;
  });
}

export function timelineDuration(clips: TimelineClip[]) {
  if (!clips.length) return 0;
  const last = clips[clips.length - 1];
  return last.timelineStart + last.duration;
}

export function clipAtTime(clips: TimelineClip[], time: number) {
  if (!clips.length) return null;
  const max = timelineDuration(clips);
  const safe = Math.max(0, Math.min(time, Math.max(0, max - 0.0001)));
  return (
    clips.find(
      (clip) =>
        safe >= clip.timelineStart &&
        safe < clip.timelineStart + clip.duration
    ) ?? clips[clips.length - 1]
  );
}

export function appendClip(
  clips: TimelineClip[],
  clip: Omit<TimelineClip, "timelineStart" | "duration">
) {
  return reflowTimeline([
    ...clips,
    {
      ...clip,
      timelineStart: 0,
      duration: clipDuration(clip),
    },
  ]);
}

export function removeClip(clips: TimelineClip[], clipId: string) {
  return reflowTimeline(clips.filter((clip) => clip.id !== clipId));
}

export function duplicateClip(
  clips: TimelineClip[],
  clipId: string,
  newClipId: string
) {
  const index = clips.findIndex((clip) => clip.id === clipId);
  if (index < 0) return clips;
  const source = clips[index];
  const next = [...clips];
  next.splice(index + 1, 0, {
    ...source,
    id: newClipId,
    name: `${source.name} copy`,
  });
  return reflowTimeline(next);
}

export function moveClip(
  clips: TimelineClip[],
  clipId: string,
  direction: -1 | 1
) {
  const index = clips.findIndex((clip) => clip.id === clipId);
  if (index < 0) return clips;
  const target = index + direction;
  if (target < 0 || target >= clips.length) return clips;
  const next = [...clips];
  [next[index], next[target]] = [next[target], next[index]];
  return reflowTimeline(next);
}

export function trimClip(
  clips: TimelineClip[],
  clipId: string,
  sourceStart: number,
  sourceEnd: number
) {
  const start = Math.max(0, sourceStart);
  const end = Math.max(start + MIN_CLIP_DURATION, sourceEnd);
  return reflowTimeline(
    clips.map((clip) =>
      clip.id === clipId
        ? {
            ...clip,
            sourceStart: start,
            sourceEnd: end,
          }
        : clip
    )
  );
}

export function splitClip(
  clips: TimelineClip[],
  clipId: string,
  timelineTime: number,
  newClipId: string
) {
  const index = clips.findIndex((clip) => clip.id === clipId);
  if (index < 0) return clips;

  const clip = clips[index];
  const localTime = timelineTime - clip.timelineStart;
  if (
    localTime <= MIN_CLIP_DURATION ||
    localTime >= clip.duration - MIN_CLIP_DURATION
  ) {
    return clips;
  }

  const sourceSplit = clip.sourceStart + localTime;
  const left: TimelineClip = {
    ...clip,
    sourceEnd: sourceSplit,
  };
  const right: TimelineClip = {
    ...clip,
    id: newClipId,
    name: `${clip.name} split`,
    sourceStart: sourceSplit,
  };

  const next = [...clips];
  next.splice(index, 1, left, right);
  return reflowTimeline(next);
}

export function clampPlayhead(clips: TimelineClip[], value: number) {
  return Math.max(0, Math.min(value, timelineDuration(clips)));
}
