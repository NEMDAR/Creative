import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import { extname, join } from "node:path";
import { renderManifestToMp4 } from "./ffmpeg-renderer";
import type {
  DurableRenderJob,
  RenderJobPriority,
  ServerRenderManifest,
} from "./server-types";

type AssetMap = Record<string, string>;

const runningJobs = new Set<string>();

function maxConcurrency() {
  const parsed = Number(process.env.RENDER_MAX_CONCURRENCY ?? 2);
  return Math.max(1, Math.min(8, Number.isFinite(parsed) ? Math.floor(parsed) : 2));
}

function normalizePriority(value: FormDataEntryValue | null): RenderJobPriority {
  return value === "high" || value === "low" ? value : "normal";
}

function priorityRank(priority: RenderJobPriority) {
  return priority === "high" ? 3 : priority === "normal" ? 2 : 1;
}

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

  // Windows can transiently reject an atomic rename while another reader,
  // antivirus scanner, or indexer still has the destination handle open.
  // Treat that as I/O contention, not as a failed render attempt.
  const retryable = new Set(["EPERM", "EBUSY", "EACCES"]);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await fs.rename(temp, path);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (!retryable.has(code) || attempt === 5) {
        await fs.rm(temp, { force: true }).catch(() => undefined);
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
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
  const job = await readJson<DurableRenderJob>(jobFile(jobId));
  return {
    ...job,
    priority: job.priority ?? "normal",
    attempts: Number.isFinite(job.attempts) ? job.attempts : 0,
    maxAttempts: Number.isFinite(job.maxAttempts) ? Math.max(1, job.maxAttempts) : 2,
  } satisfies DurableRenderJob;
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
  const priority = normalizePriority(formData.get("priority"));
  const requestedMaxAttempts = Number(formData.get("maxAttempts") ?? 2);
  const maxAttempts = Math.max(
    1,
    Math.min(
      5,
      Number.isFinite(requestedMaxAttempts) ? Math.floor(requestedMaxAttempts) : 2
    )
  );
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
    priority,
    attempts: 0,
    maxAttempts,
    createdAt: now,
    updatedAt: now,
    manifestFile: "manifest.json",
    assetMapFile: "assets.json",
    outputFile: "output.mp4",
  };
  await writeJsonAtomic(jobFile(id), job);

  setTimeout(() => {
    void scheduleRenderQueue();
  }, 0);

  return job;
}

export async function getRenderJob(jobId: string) {
  const job = await readJob(jobId);
  if (!job) return null;

  if (job.status === "queued" || (job.status === "running" && !runningJobs.has(jobId))) {
    setTimeout(() => {
      void scheduleRenderQueue();
    }, 0);
  }

  return job;
}

export async function scheduleRenderQueue() {
  const capacity = Math.max(0, maxConcurrency() - runningJobs.size);
  if (capacity === 0) return;

  const queued = (await listRecentRenderJobs(50))
    .filter((job) => job.status === "queued" && !runningJobs.has(job.jobId))
    .sort((a, b) => {
      const priorityDelta = priorityRank(b.priority) - priorityRank(a.priority);
      return priorityDelta || a.createdAt - b.createdAt;
    })
    .slice(0, capacity);

  for (const job of queued) {
    void kickRenderJob(job.jobId);
  }
}

export async function kickRenderJob(jobId: string) {
  if (runningJobs.has(jobId) || runningJobs.size >= maxConcurrency()) return;

  // Claim synchronously before the first await so concurrent scheduler passes
  // cannot start the same durable job twice.
  runningJobs.add(jobId);
  const workerId = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
  let job: DurableRenderJob | null = null;
  let attempt = 0;
  try {
    job = await readJob(jobId);
    if (!job || job.status !== "queued") return;

    attempt = job.attempts + 1;
    const dir = jobDir(jobId);
    const manifest = await readJson<ServerRenderManifest>(manifestFile(jobId));
    const assets = await readJson<AssetMap>(assetMapFile(jobId));

    await updateJob(jobId, {
      status: "running",
      progress: Math.max(1, job.progress),
      stage: `Starting FFmpeg worker · attempt ${attempt}/${job.maxAttempts}`,
      attempts: attempt,
      workerId,
      startedAt: Date.now(),
      completedAt: undefined,
      error: undefined,
    });

    await renderManifestToMp4(dir, manifest, assets, job.outputFile, {
      onProgress: async (progress, stage) => {
        await updateJob(jobId, {
          status: "running",
          progress,
          stage,
          workerId,
          attempts: attempt,
        });
      },
    });

    await updateJob(jobId, {
      status: "succeeded",
      progress: 100,
      stage: "Complete",
      outputUrl: `/api/render/jobs/${jobId}/output`,
      completedAt: Date.now(),
      workerId,
      attempts: attempt,
      error: undefined,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(-6000)
        : "Unexpected render worker failure.";
    if (!job) return;
    if (attempt < job.maxAttempts) {
      await updateJob(jobId, {
        status: "queued",
        progress: 0,
        stage: `Retry queued · attempt ${attempt + 1}/${job.maxAttempts}`,
        workerId: undefined,
        attempts: attempt,
        error: message,
      }).catch(() => undefined);
    } else {
      await updateJob(jobId, {
        status: "failed",
        stage: "Failed",
        completedAt: Date.now(),
        workerId,
        attempts: attempt,
        error: message,
      }).catch(() => undefined);
    }
  } finally {
    runningJobs.delete(jobId);
    setTimeout(() => {
      void scheduleRenderQueue();
    }, 50);
  }
}

export async function retryRenderJob(jobId: string) {
  const job = await readJob(jobId);
  if (!job) return null;
  if (job.status !== "failed") {
    throw new Error("Only failed render jobs can be retried manually.");
  }
  const next = await updateJob(jobId, {
    status: "queued",
    progress: 0,
    stage: "Manual retry queued",
    maxAttempts: Math.max(job.maxAttempts, job.attempts + 1),
    completedAt: undefined,
    workerId: undefined,
    error: undefined,
  });
  setTimeout(() => {
    void scheduleRenderQueue();
  }, 0);
  return next;
}

export async function getRenderQueueSnapshot() {
  const jobs = await listRecentRenderJobs(50);
  return {
    maxConcurrency: maxConcurrency(),
    running: runningJobs.size,
    queued: jobs.filter((job) => job.status === "queued").length,
    failed: jobs.filter((job) => job.status === "failed").length,
    succeeded: jobs.filter((job) => job.status === "succeeded").length,
    runningJobIds: [...runningJobs],
  };
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
