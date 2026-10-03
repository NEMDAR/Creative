import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { resolveFfmpegPath } from "../render/ffmpeg-renderer";

export type SilenceRange = {
  startTime: number;
  endTime: number;
  duration: number;
};

export type SilenceAnalysis = {
  ranges: SilenceRange[];
  thresholdDb: number;
  minDuration: number;
};

export async function analyzeSilence(
  file: File,
  thresholdDb = -40,
  minDuration = 0.35
): Promise<SilenceAnalysis> {
  const ffmpegPath = resolveFfmpegPath();
  const dir = await mkdtemp(join(tmpdir(), "nemdar-silence-"));
  const suffix = extname(file.name || "") || ".bin";
  const inputPath = join(dir, `input${suffix}`);

  try {
    await writeFile(inputPath, Buffer.from(await file.arrayBuffer()));
    const stderr = await runSilenceDetect(
      ffmpegPath,
      inputPath,
      thresholdDb,
      minDuration
    );

    return {
      ranges: parseSilenceRanges(stderr),
      thresholdDb,
      minDuration,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function runSilenceDetect(
  ffmpegPath: string,
  inputPath: string,
  thresholdDb: number,
  minDuration: number
) {
  return new Promise<string>((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-i",
      inputPath,
      "-af",
      `silencedetect=noise=${thresholdDb}dB:d=${minDuration}`,
      "-f",
      "null",
      "-",
    ];

    const child = spawn(ffmpegPath, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stderr);
        return;
      }
      reject(
        new Error(
          `FFmpeg silence analysis failed with code ${code ?? "unknown"}.`
        )
      );
    });
  });
}

export function parseSilenceRanges(stderr: string): SilenceRange[] {
  const starts: number[] = [];
  const ranges: SilenceRange[] = [];

  for (const line of stderr.split(/\r?\n/)) {
    const startMatch = line.match(/silence_start:\s*([0-9.]+)/);
    if (startMatch) {
      starts.push(Number(startMatch[1]));
      continue;
    }

    const endMatch = line.match(
      /silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/
    );
    if (!endMatch) continue;

    const endTime = Number(endMatch[1]);
    const duration = Number(endMatch[2]);
    const startTime = starts.shift() ?? Math.max(0, endTime - duration);

    if (
      Number.isFinite(startTime) &&
      Number.isFinite(endTime) &&
      endTime > startTime
    ) {
      ranges.push({
        startTime: Number(startTime.toFixed(3)),
        endTime: Number(endTime.toFixed(3)),
        duration: Number((endTime - startTime).toFixed(3)),
      });
    }
  }

  return ranges;
}
