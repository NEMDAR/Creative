import { NextResponse } from "next/server";
import { authorizeExternalApi } from "../../../../lib/scale/api-auth";
import { createExternalJob, listExternalJobs, type ExternalJobType } from "../../../../lib/scale/api-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = authorizeExternalApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const url = new URL(request.url);
  return NextResponse.json({ jobs: listExternalJobs(url.searchParams.get("projectId") ?? undefined) });
}

export async function POST(request: Request) {
  const auth = authorizeExternalApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = (await request.json()) as {
      projectId?: string;
      type?: ExternalJobType;
      payload?: Record<string, unknown>;
    };
    if (!body.projectId || !body.type) throw new Error("projectId and type are required.");
    return NextResponse.json(
      createExternalJob({ projectId: body.projectId, type: body.type, payload: body.payload }),
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create job." },
      { status: 400 }
    );
  }
}
