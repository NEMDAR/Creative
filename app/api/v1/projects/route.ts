import { NextResponse } from "next/server";
import { authorizeExternalApi } from "../../../../lib/scale/api-auth";
import { createExternalProject, listExternalProjects } from "../../../../lib/scale/api-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = authorizeExternalApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ projects: listExternalProjects() });
}

export async function POST(request: Request) {
  const auth = authorizeExternalApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = (await request.json()) as { name?: string; metadata?: Record<string, unknown> };
    return NextResponse.json(
      createExternalProject({ name: body.name ?? "", metadata: body.metadata }),
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create project." },
      { status: 400 }
    );
  }
}
