import { getRenderJob, retryRenderJob } from "../../../../../lib/render/server-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params;
  const job = await getRenderJob(jobId);
  if (!job) {
    return Response.json({ error: "Render job not found." }, { status: 404 });
  }

  return Response.json({
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
  });
}


export async function POST(
  _request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await context.params;
    const job = await retryRenderJob(jobId);
    if (!job) {
      return Response.json({ error: "Render job not found." }, { status: 404 });
    }
    return Response.json({
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      stage: job.stage,
      priority: job.priority,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      updatedAt: job.updatedAt,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to retry render job." },
      { status: 409 }
    );
  }
}
