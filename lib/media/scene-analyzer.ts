import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { resolveFfmpegPath } from "../render/ffmpeg-renderer";

export type SceneAnalysis = {
  boundaries: number[];
  threshold: number;
};

export async function analyzeScenes(
  file: File,
  threshold = 0.35
): Promise<SceneAnalysis> {
  const ffmpegPath = resolveFfmpegPath();
  const dir = await mkdtemp(join(tmpdir(), "nemdar-scenes-"));
  const suffix = extname(file.name || "") || ".bin";
  const inputPath = join(dir, `input${suffix}`);

  try {
    await writeFile(inputPath, Buffer.from(await file.arrayBuffer()));
    const stderr = await runSceneDetect(ffmpegPath, inputPath, threshold);
    return {
      boundaries: parseSceneBoundaries(stderr),
      threshold,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function runSceneDetect(
  ffmpegPath: string,
  inputPath: string,
  threshold: number
) {
  return new Promise<string>((resolve, reject) => {
    const filter = `select=gt(scene\\,${threshold}),showinfo`;
    const child = spawn(
      ffmpegPath,
      [
        "-hide_banner",
        "-i",
        inputPath,
        "-vf",
        filter,
        "-an",
        "-f",
        "null",
        "-",
      ],
      {
        windowsHide: true,
        stdio: ["ignore", "ignore", "pipe"],
      }
    );

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
          `FFmpeg scene analysis failed with code ${code ?? "unknown"}.`
        )
      );
    });
  });
}

export function parseSceneBoundaries(stderr: string): number[] {
  const values = new Set<number>();

  for (const line of stderr.split(/\r?\n/)) {
    if (!line.includes("showinfo")) continue;
    const match = line.match(/pts_time:([0-9.]+)/);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0.05) {
      values.add(Number(value.toFixed(3)));
    }
  }

  return Array.from(values).sort((a, b) => a - b);
}
