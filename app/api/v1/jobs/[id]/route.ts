import { NextResponse } from "next/server";
import { authorizeExternalApi } from "../../../../../lib/scale/api-auth";
import { getExternalJob, updateExternalJob, type ExternalJobStatus } from "../../../../../lib/scale/api-store";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = authorizeExternalApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await context.params;
  const job = getExternalJob(id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  return NextResponse.json(job);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = authorizeExternalApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      status?: ExternalJobStatus;
      output?: Record<string, unknown> | null;
      error?: string | null;
    };
    return NextResponse.json(updateExternalJob(id, body));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update job.";
    return NextResponse.json({ error: message }, { status: message === "Job not found." ? 404 : 400 });
  }
}
