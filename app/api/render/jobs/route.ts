import {
  createRenderJob,
  getRenderQueueSnapshot,
  listRecentRenderJobs,
} from "../../../../lib/render/server-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicJob(job: Awaited<ReturnType<typeof createRenderJob>>) {
  return {
    jobId: job.jobId,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    priority: job.priority,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    workerId: job.workerId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    outputUrl: job.outputUrl,
    error: job.error,
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const job = await createRenderJob(formData);
    return Response.json(publicJob(job), { status: 202 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create render job.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function GET() {
  const [jobs, queue] = await Promise.all([
    listRecentRenderJobs(),
    getRenderQueueSnapshot(),
  ]);
  return Response.json({
    queue,
    jobs: jobs.map((job) => ({
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      stage: job.stage,
      priority: job.priority,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      workerId: job.workerId,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      outputUrl: job.outputUrl,
      error: job.error,
    })),
  });
}
