import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import { extname, join } from "node:path";
import { renderManifestToMp4 } from "./ffmpeg-renderer";
import type {
  DurableRenderJob,
  ServerRenderManifest,
} from "./server-types";

type AssetMap = Record<string, string>;

const runningJobs = new Set<string>();

function queueRoot() {
  const configured = process.env.RENDER_QUEUE_DIR?.trim();
  return configured || join(process.cwd(), ".nemdar-render");
}

function jobsRoot() {
  return join(queueRoot(), "jobs");
}

function jobDir(jobId: string) {
  return join(jobsRoot(), jobId);
}

function jobFile(jobId: string) {
  return join(jobDir(jobId), "job.json");
}

function manifestFile(jobId: string) {
  return join(jobDir(jobId), "manifest.json");
}

function assetMapFile(jobId: string) {
  return join(jobDir(jobId), "assets.json");
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "asset";
}

function extensionFor(file: File) {
  const fromName = extname(file.name);
  if (fromName) return fromName.toLowerCase();
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "audio/wav": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
    "audio/ogg": ".ogg",
  };
  return map[file.type] ?? ".bin";
}

async function writeJsonAtomic(path: string, value: unknown) {
  const temp = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(temp, path);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await fs.readFile(path, "utf8")) as T;
}

function validateManifest(value: unknown): ServerRenderManifest {
  if (!value || typeof value !== "object") {
    throw new Error("Render manifest must be an object.");
  }
  const manifest = value as ServerRenderManifest;
  if (manifest.schemaVersion !== 1) {
    throw new Error("Unsupported render manifest schema.");
  }
  if (
    !manifest.output ||
    !Number.isFinite(manifest.output.width) ||
    !Number.isFinite(manifest.output.height) ||
    !Number.isFinite(manifest.output.fps)
  ) {
    throw new Error("Render manifest has invalid output settings.");
  }
  if (!manifest.timeline?.tracks?.[0]?.clips?.length) {
    throw new Error("Render manifest contains no visual clips.");
  }
  if (!Array.isArray(manifest.media)) {
    throw new Error("Render manifest media list is missing.");
  }
  return manifest;
}

async function readJob(jobId: string) {
  if (!existsSync(jobFile(jobId))) return null;
  return readJson<DurableRenderJob>(jobFile(jobId));
}

async function updateJob(
  jobId: string,
  patch: Partial<DurableRenderJob>
): Promise<DurableRenderJob> {
  const current = await readJob(jobId);
  if (!current) throw new Error("Render job not found.");
  const next: DurableRenderJob = {
    ...current,
    ...patch,
    jobId,
    updatedAt: Date.now(),
  };
  await writeJsonAtomic(jobFile(jobId), next);
  return next;
}

export async function createRenderJob(
  formData: FormData
): Promise<DurableRenderJob> {
  const rawManifest = formData.get("manifest");
  if (typeof rawManifest !== "string") {
    throw new Error("Render request is missing the manifest.");
  }

  const manifest = validateManifest(JSON.parse(rawManifest));
  const id = randomUUID();
  const dir = jobDir(id);
  const assetsDir = join(dir, "assets");
  await fs.mkdir(assetsDir, { recursive: true });

  const assets: AssetMap = {};
  for (const [field, entry] of formData.entries()) {
    if (field === "manifest" || typeof entry === "string") continue;
    const file = entry as File;
    const filename = `${safeName(field)}-${safeName(file.name || "asset")}${extensionFor(file)}`;
    const relativePath = join("assets", filename);
    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(join(dir, relativePath), bytes);
    assets[field] = relativePath;
  }

  for (const media of manifest.media) {
    if (!assets[media.field]) {
      throw new Error(`Missing media upload for ${media.name}.`);
    }
  }
  for (const overlay of manifest.overlays) {
    if (!assets[overlay.field]) {
      throw new Error(`Missing overlay upload for ${overlay.id}.`);
    }
  }
  if (manifest.audioTrack && !assets[manifest.audioTrack.field]) {
    throw new Error("Missing audio-track upload.");
  }

  await writeJsonAtomic(manifestFile(id), manifest);
  await writeJsonAtomic(assetMapFile(id), assets);

  const now = Date.now();
  const job: DurableRenderJob = {
    jobId: id,
    status: "queued",
    progress: 0,
    stage: "Queued",
    createdAt: now,
    updatedAt: now,
    manifestFile: "manifest.json",
    assetMapFile: "assets.json",
    outputFile: "output.mp4",
  };
  await writeJsonAtomic(jobFile(id), job);

  setTimeout(() => {
    void kickRenderJob(id);
  }, 0);

  return job;
}

export async function getRenderJob(jobId: string) {
  const job = await readJob(jobId);
  if (!job) return null;

  if (
    (job.status === "queued" || job.status === "running") &&
    !runningJobs.has(jobId)
  ) {
    setTimeout(() => {
      void kickRenderJob(jobId);
    }, 0);
  }

  return job;
}

export async function kickRenderJob(jobId: string) {
  if (runningJobs.has(jobId)) return;
  const job = await readJob(jobId);
  if (!job || job.status === "succeeded" || job.status === "failed") return;

  runningJobs.add(jobId);
  try {
    const dir = jobDir(jobId);
    const manifest = await readJson<ServerRenderManifest>(manifestFile(jobId));
    const assets = await readJson<AssetMap>(assetMapFile(jobId));

    await updateJob(jobId, {
      status: "running",
      progress: Math.max(1, job.progress),
      stage: "Starting FFmpeg worker",
      error: undefined,
    });

    await renderManifestToMp4(
      dir,
      manifest,
      assets,
      job.outputFile,
      {
        onProgress: async (progress, stage) => {
          await updateJob(jobId, {
            status: "running",
            progress,
            stage,
          });
        },
      }
    );

    await updateJob(jobId, {
      status: "succeeded",
      progress: 100,
      stage: "Complete",
      outputUrl: `/api/render/jobs/${jobId}/output`,
      error: undefined,
    });
  } catch (error) {
    await updateJob(jobId, {
      status: "failed",
      stage: "Failed",
      error:
        error instanceof Error
          ? error.message.slice(-6000)
          : "Unexpected render worker failure.",
    }).catch(() => undefined);
  } finally {
    runningJobs.delete(jobId);
  }
}

export async function renderJobOutput(jobId: string) {
  const job = await readJob(jobId);
  if (!job || job.status !== "succeeded") return null;
  const path = join(jobDir(jobId), job.outputFile);
  if (!existsSync(path)) return null;
  return {
    job,
    path,
  };
}

export async function listRecentRenderJobs(limit = 10) {
  await fs.mkdir(jobsRoot(), { recursive: true });
  const entries = await fs.readdir(jobsRoot(), { withFileTypes: true });
  const jobs: DurableRenderJob[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const job = await readJob(entry.name).catch(() => null);
    if (job) jobs.push(job);
  }
  return jobs
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, Math.max(1, Math.min(50, limit)));
}
