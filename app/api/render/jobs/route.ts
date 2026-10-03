import {
  createRenderJob,
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
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
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
  const jobs = await listRecentRenderJobs();
  return Response.json({
    jobs: jobs.map((job) => ({
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      stage: job.stage,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      outputUrl: job.outputUrl,
      error: job.error,
    })),
  });
}
