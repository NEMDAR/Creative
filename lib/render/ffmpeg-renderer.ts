import { existsSync, readdirSync } from "node:fs";
import { promises as fs } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import type { TimelineClip } from "../editor/timeline";
import type { ServerRenderManifest } from "./server-types";

type AssetMap = Record<string, string>;

type RenderCallbacks = {
  onProgress?: (progress: number, stage: string) => Promise<void> | void;
};

function even(value: number) {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

function n(value: number) {
  return Number(value.toFixed(4)).toString();
}

function findFileRecursive(root: string, filename: string, depth = 4): string | null {
  if (depth < 0 || !existsSync(root)) return null;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) {
      return full;
    }
    if (entry.isDirectory()) {
      const found = findFileRecursive(full, filename, depth - 1);
      if (found) return found;
    }
  }
  return null;
}

export function resolveFfmpegPath() {
  const configured = process.env.FFMPEG_PATH?.trim();
  if (configured && existsSync(configured)) return configured;

  const pathProbe = spawnSync("ffmpeg", ["-version"], {
    stdio: "ignore",
    windowsHide: true,
  });
  if (pathProbe.status === 0) return "ffmpeg";

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const packagesRoot = join(localAppData, "Microsoft", "WinGet", "Packages");
      if (existsSync(packagesRoot)) {
        const packageDirs = readdirSync(packagesRoot, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && /ffmpeg/i.test(entry.name))
          .sort((a, b) => {
            const score = (name: string) =>
              (/lgpl/i.test(name) ? 10 : 0) +
              (/8\.1/i.test(name) ? 5 : 0) +
              (/btbn/i.test(name) ? 2 : 0);
            return score(b.name) - score(a.name);
          });
        for (const entry of packageDirs) {
          const found = findFileRecursive(join(packagesRoot, entry.name), "ffmpeg.exe", 5);
          if (found) return found;
        }
      }
    }
  }

  throw new Error(
    "FFmpeg was not found. Install FFmpeg or set the server-only FFMPEG_PATH environment variable."
  );
}

function resolveVideoEncoder(ffmpegPath: string) {
  const configured = process.env.FFMPEG_VIDEO_ENCODER?.trim();
  if (configured) return configured;

  const result = spawnSync(ffmpegPath, ["-hide_banner", "-encoders"], {
    encoding: "utf8",
    windowsHide: true,
  });
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  for (const encoder of ["libx264", "libopenh264", "h264_mf", "mpeg4"]) {
    if (text.includes(encoder)) return encoder;
  }
  throw new Error("No supported MP4 video encoder was found in this FFmpeg build.");
}

async function runFfmpeg(
  ffmpegPath: string,
  args: string[],
  cwd: string,
  logFile: string
) {
  await fs.mkdir(dirname(logFile), { recursive: true });

  return new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, ["-hide_banner", "-y", ...args], {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let tail = "";
    const append = (chunk: Buffer | string) => {
      const text = chunk.toString();
      tail = (tail + text).slice(-12_000);
      void fs.appendFile(logFile, text);
    };

    const configuredTimeout = Number(process.env.RENDER_FFMPEG_TIMEOUT_MS ?? 120_000);
    const timeoutMs = Math.max(
      5_000,
      Math.min(30 * 60_000, Number.isFinite(configuredTimeout) ? configuredTimeout : 120_000)
    );
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new Error(`FFmpeg timed out after ${timeoutMs}ms. ${tail.slice(-2500)}`)));
    }, timeoutMs);

    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code) => {
      finish(() => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `FFmpeg exited with code ${code ?? "unknown"}. ${tail.slice(-2500)}`
            )
          );
        }
      });
    });
  });
}

function mediaForClip(manifest: ServerRenderManifest, clip: TimelineClip) {
  const media = manifest.media.find((item) => item.id === clip.assetId);
  if (!media) throw new Error(`Missing media manifest for asset ${clip.assetId}.`);
  return media;
}

function assetPath(jobDir: string, assetMap: AssetMap, field: string) {
  const stored = assetMap[field];
  if (!stored) throw new Error(`Missing uploaded asset for field ${field}.`);
  return join(jobDir, stored);
}

function baseVisualFilter(
  clip: TimelineClip,
  width: number,
  height: number,
  fps: number
) {
  const transform = clip.transform ?? {
    fit: "cover" as const,
    cropX: 50,
    cropY: 50,
    zoom: 1,
    rotation: 0,
    speed: 1,
  };
  const cx = Math.max(0, Math.min(100, transform.cropX ?? 50)) / 100;
  const cy = Math.max(0, Math.min(100, transform.cropY ?? 50)) / 100;
  const speed = Math.max(0.25, Math.min(4, transform.speed ?? 1));
  const filters: string[] = [
    clip.kind === "video"
      ? `setpts=(PTS-STARTPTS)/${n(speed)}`
      : "setpts=PTS-STARTPTS",
    "settb=AVTB",
  ];

  if (transform.fit === "contain") {
    filters.push(
      `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
      `pad=${width}:${height}:(ow-iw)*${n(cx)}:(oh-ih)*${n(cy)}:black`
    );
  } else if (transform.fit === "fill") {
    filters.push(`scale=${width}:${height}`);
  } else {
    filters.push(
      `scale=${width}:${height}:force_original_aspect_ratio=increase`,
      `crop=${width}:${height}:(iw-${width})*${n(cx)}:(ih-${height})*${n(cy)}`
    );
  }

  const zoom = Math.max(0.5, Math.min(3, transform.zoom ?? 1));
  if (Math.abs(zoom - 1) > 0.001) {
    const zoomW = even(width * zoom);
    const zoomH = even(height * zoom);
    filters.push(
      `scale=${zoomW}:${zoomH}`,
      `crop=${width}:${height}:(iw-${width})*${n(cx)}:(ih-${height})*${n(cy)}`
    );
  }

  const rotation = Math.max(-180, Math.min(180, transform.rotation ?? 0));
  if (Math.abs(rotation) > 0.01) {
    filters.push(
      `rotate=${n(rotation)}*PI/180:ow=iw:oh=ih:c=black`
    );
  }

  filters.push(`fps=${fps}`, "format=yuv420p");
  return filters;
}

function fadeFilters(
  clips: TimelineClip[],
  index: number,
  current: TimelineClip
) {
  const filters: string[] = [];
  const previous = index > 0 ? clips[index - 1] : null;
  if (previous?.transitionOut?.type === "fade") {
    const d = Math.min(previous.transitionOut.duration, current.duration / 2);
    filters.push(`fade=t=in:st=0:d=${n(d)}`);
  }
  if (current.transitionOut?.type === "fade") {
    const d = Math.min(current.transitionOut.duration, current.duration / 2);
    filters.push(
      `fade=t=out:st=${n(Math.max(0, current.duration - d))}:d=${n(d)}`
    );
  }
  return filters;
}

async function renderClipSegment(
  ffmpegPath: string,
  encoder: string,
  jobDir: string,
  manifest: ServerRenderManifest,
  assetMap: AssetMap,
  clip: TimelineClip,
  index: number,
  segmentFile: string,
  logFile: string
) {
  const { width, height, fps } = manifest.output;
  const clips = manifest.timeline.tracks[0]?.clips ?? [];
  const media = mediaForClip(manifest, clip);
  const currentPath = assetPath(jobDir, assetMap, media.field);
  const args: string[] = [];

  if (clip.kind === "image") {
    args.push(
      "-loop",
      "1",
      "-framerate",
      String(fps),
      "-t",
      n(clip.duration),
      "-i",
      currentPath
    );
  } else {
    const speed = Math.max(0.25, Math.min(4, clip.transform?.speed ?? 1));
    const sourceSpan = clip.duration * speed;
    args.push(
      "-ss",
      n(clip.sourceStart),
      "-t",
      n(sourceSpan),
      "-i",
      currentPath
    );
  }

  const next = clips[index + 1] ?? null;
  const crossfade =
    clip.transitionOut?.type === "crossfade" &&
    clip.kind === "image" &&
    next?.kind === "image";

  if (crossfade && next) {
    const nextMedia = mediaForClip(manifest, next);
    const nextPath = assetPath(jobDir, assetMap, nextMedia.field);
    args.push(
      "-loop",
      "1",
      "-framerate",
      String(fps),
      "-t",
      n(clip.duration),
      "-i",
      nextPath
    );

    const aFilters = [
      ...baseVisualFilter(clip, width, height, fps),
      ...fadeFilters(clips, index, clip),
    ];
    const bFilters = baseVisualFilter(next, width, height, fps);
    const d = Math.min(
      clip.transitionOut?.duration ?? 0.5,
      clip.duration / 2,
      next.duration / 2
    );
    const offset = Math.max(0, clip.duration - d);
    const filterComplex = [
      `[0:v]${aFilters.join(",")}[a]`,
      `[1:v]${bFilters.join(",")}[b]`,
      `[a][b]xfade=transition=fade:duration=${n(d)}:offset=${n(offset)},trim=duration=${n(clip.duration)},setpts=PTS-STARTPTS[v]`,
    ].join(";");

    args.push("-filter_complex", filterComplex, "-map", "[v]");
  } else {
    const filters = [
      ...baseVisualFilter(clip, width, height, fps),
      ...fadeFilters(clips, index, clip),
    ];
    args.push("-vf", filters.join(","));
  }

  args.push(
    "-an",
    "-t",
    n(clip.duration),
    "-c:v",
    encoder,
    "-b:v",
    process.env.FFMPEG_VIDEO_BITRATE ?? "5M",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(fps),
    "-movflags",
    "+faststart",
    segmentFile
  );

  await runFfmpeg(ffmpegPath, args, jobDir, logFile);
}

async function concatSegments(
  ffmpegPath: string,
  jobDir: string,
  segmentFiles: string[],
  visualFile: string,
  logFile: string
) {
  const concatFile = join(jobDir, "concat.txt");
  const lines = segmentFiles.map((file) => {
    const rel = relative(jobDir, join(jobDir, file)).replace(/\\/g, "/");
    return `file '${rel.replace(/'/g, "'\\''")}'`;
  });
  await fs.writeFile(concatFile, lines.join("\n") + "\n");

  await runFfmpeg(
    ffmpegPath,
    ["-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", visualFile],
    jobDir,
    logFile
  );
}

async function applyOverlays(
  ffmpegPath: string,
  encoder: string,
  jobDir: string,
  manifest: ServerRenderManifest,
  assetMap: AssetMap,
  visualFile: string,
  compositedFile: string,
  logFile: string
) {
  if (manifest.overlays.length === 0) {
    await fs.copyFile(join(jobDir, visualFile), join(jobDir, compositedFile));
    return;
  }

  const args: string[] = ["-i", visualFile];
  for (const overlay of manifest.overlays) {
    args.push(
      "-loop",
      "1",
      "-framerate",
      String(manifest.output.fps),
      "-i",
      assetPath(jobDir, assetMap, overlay.field)
    );
  }

  const filters: string[] = [];
  let current = "[0:v]";
  manifest.overlays.forEach((overlay, index) => {
    const inputIndex = index + 1;
    const imageLabel = `ov${index}`;
    const outLabel = `v${index + 1}`;
    filters.push(
      `[${inputIndex}:v]format=rgba[${imageLabel}]`,
      `${current}[${imageLabel}]overlay=x=${Math.round(overlay.x)}:y=${Math.round(overlay.y)}:enable='between(t,${n(overlay.startTime)},${n(overlay.endTime)})'[${outLabel}]`
    );
    current = `[${outLabel}]`;
  });

  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    current,
    "-an",
    "-t",
    n(manifest.duration),
    "-c:v",
    encoder,
    "-b:v",
    process.env.FFMPEG_VIDEO_BITRATE ?? "5M",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(manifest.output.fps),
    "-movflags",
    "+faststart",
    compositedFile
  );

  await runFfmpeg(ffmpegPath, args, jobDir, logFile);
}

async function applyAudio(
  ffmpegPath: string,
  jobDir: string,
  manifest: ServerRenderManifest,
  assetMap: AssetMap,
  compositedFile: string,
  outputFile: string,
  logFile: string
) {
  if (!manifest.audioTrack) {
    await fs.copyFile(join(jobDir, compositedFile), join(jobDir, outputFile));
    return;
  }

  const audio = manifest.audioTrack;
  const audioPath = assetPath(jobDir, assetMap, audio.field);
  const fadeOutStart = Math.max(0, audio.duration - audio.fadeOut);
  const delayMs = Math.max(0, Math.round(audio.startTime * 1000));
  const audioFilters = [
    `atrim=start=0:duration=${n(audio.duration)}`,
    "asetpts=PTS-STARTPTS",
    `volume=${n(audio.gain)}`,
  ];
  if (audio.fadeIn > 0) {
    audioFilters.push(`afade=t=in:st=0:d=${n(audio.fadeIn)}`);
  }
  if (audio.fadeOut > 0) {
    audioFilters.push(
      `afade=t=out:st=${n(fadeOutStart)}:d=${n(audio.fadeOut)}`
    );
  }
  if (delayMs > 0) {
    audioFilters.push(`adelay=delays=${delayMs}:all=1`);
  }
  audioFilters.push("apad", `atrim=duration=${n(manifest.duration)}`);

  await runFfmpeg(
    ffmpegPath,
    [
      "-i",
      compositedFile,
      "-i",
      audioPath,
      "-filter_complex",
      `[1:a]${audioFilters.join(",")}[a]`,
      "-map",
      "0:v:0",
      "-map",
      "[a]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      process.env.FFMPEG_AUDIO_BITRATE ?? "192k",
      "-t",
      n(manifest.duration),
      "-movflags",
      "+faststart",
      outputFile,
    ],
    jobDir,
    logFile
  );
}

export async function renderManifestToMp4(
  jobDir: string,
  manifest: ServerRenderManifest,
  assetMap: AssetMap,
  outputFile: string,
  callbacks: RenderCallbacks = {}
) {
  const ffmpegPath = resolveFfmpegPath();
  const encoder = resolveVideoEncoder(ffmpegPath);
  const clips = manifest.timeline.tracks[0]?.clips ?? [];
  if (clips.length === 0) throw new Error("Render manifest has no visual clips.");

  const segmentsDir = join(jobDir, "segments");
  await fs.mkdir(segmentsDir, { recursive: true });
  const logFile = join(jobDir, "ffmpeg.log");
  await fs.writeFile(logFile, "");

  const segmentFiles: string[] = [];
  for (let index = 0; index < clips.length; index += 1) {
    const filename = `segments/clip-${String(index).padStart(3, "0")}.mp4`;
    segmentFiles.push(filename);
    await callbacks.onProgress?.(
      5 + Math.round((index / Math.max(1, clips.length)) * 55),
      `Rendering clip ${index + 1} of ${clips.length}`
    );
    await renderClipSegment(
      ffmpegPath,
      encoder,
      jobDir,
      manifest,
      assetMap,
      clips[index],
      index,
      filename,
      logFile
    );
  }

  await callbacks.onProgress?.(65, "Joining timeline");
  const visualFile = "visual.mp4";
  await concatSegments(ffmpegPath, jobDir, segmentFiles, visualFile, logFile);

  await callbacks.onProgress?.(78, "Applying overlays");
  const compositedFile = "composited.mp4";
  await applyOverlays(
    ffmpegPath,
    encoder,
    jobDir,
    manifest,
    assetMap,
    visualFile,
    compositedFile,
    logFile
  );

  await callbacks.onProgress?.(90, "Mixing audio");
  await applyAudio(
    ffmpegPath,
    jobDir,
    manifest,
    assetMap,
    compositedFile,
    outputFile,
    logFile
  );

  await callbacks.onProgress?.(100, "Complete");
}
