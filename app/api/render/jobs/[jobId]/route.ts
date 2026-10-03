import { getRenderJob } from "../../../../../lib/render/server-queue";

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
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    outputUrl: job.outputUrl,
    error: job.error,
  });
}
