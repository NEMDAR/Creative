import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import { resolveFfmpegPath } from "../render/ffmpeg-renderer";

export type ProxyKind = "image" | "video";

export type ProxyResult = {
  bytes: Buffer;
  mimeType: string;
  cacheKey: string;
  sourceBytes: number;
  proxyBytes: number;
};

function cacheRoot() {
  return process.env.NEMDAR_PROXY_CACHE_DIR?.trim() ||
    join(tmpdir(), "nemdar-creator-proxies");
}

function encoder(ffmpegPath: string) {
  const result = spawnSync(ffmpegPath, ["-hide_banner", "-encoders"], {
    encoding: "utf8",
    windowsHide: true,
  });
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  for (const name of ["libx264", "libopenh264", "h264_mf"]) {
    if (text.includes(name)) return name;
  }
  return "mpeg4";
}

async function run(ffmpegPath: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, ["-hide_banner", "-y", ...args], {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-12_000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg proxy generation failed (${code}). ${stderr.slice(-2500)}`));
    });
  });
}

function safeExtension(filename: string, kind: ProxyKind) {
  const ext = extname(filename).toLowerCase();
  if (/^\.[a-z0-9]{1,8}$/.test(ext)) return ext;
  return kind === "video" ? ".mp4" : ".png";
}

export async function generateMediaProxy(input: {
  bytes: Buffer;
  filename: string;
  kind: ProxyKind;
}): Promise<ProxyResult> {
  const ffmpegPath = resolveFfmpegPath();
  const cacheKey = createHash("sha256")
    .update(input.bytes)
    .update("|proxy-v1|")
    .update(input.kind)
    .digest("hex");
  const root = cacheRoot();
  await fs.mkdir(root, { recursive: true });

  const inputFile = join(root, `${cacheKey}-source${safeExtension(input.filename, input.kind)}`);
  const outputFile = join(root, `${cacheKey}-proxy.${input.kind === "video" ? "mp4" : "jpg"}`);

  try {
    const cached = await fs.readFile(outputFile);
    return {
      bytes: cached,
      mimeType: input.kind === "video" ? "video/mp4" : "image/jpeg",
      cacheKey,
      sourceBytes: input.bytes.length,
      proxyBytes: cached.length,
    };
  } catch {
    // cache miss
  }

  await fs.writeFile(inputFile, input.bytes);

  if (input.kind === "image") {
    await run(ffmpegPath, [
      "-i", inputFile,
      "-vf", "scale='min(1280,iw)':-2:force_original_aspect_ratio=decrease",
      "-frames:v", "1",
      "-q:v", "5",
      outputFile,
    ]);
  } else {
    const videoEncoder = encoder(ffmpegPath);
    await run(ffmpegPath, [
      "-i", inputFile,
      "-vf", "scale='min(1280,iw)':-2:force_original_aspect_ratio=decrease",
      "-c:v", videoEncoder,
      "-b:v", process.env.NEMDAR_PROXY_VIDEO_BITRATE ?? "1M",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "96k",
      "-movflags", "+faststart",
      outputFile,
    ]);
  }

  const bytes = await fs.readFile(outputFile);
  return {
    bytes,
    mimeType: input.kind === "video" ? "video/mp4" : "image/jpeg",
    cacheKey,
    sourceBytes: input.bytes.length,
    proxyBytes: bytes.length,
  };
}
