import { NextResponse } from "next/server";
import { createExternalProject, listExternalProjects } from "../../../../lib/scale/api-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ projects: listExternalProjects() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: string; metadata?: Record<string, unknown> };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Project name is required." }, { status: 400 });
    }
    return NextResponse.json(
      createExternalProject({ name: body.name, metadata: body.metadata }),
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create project." },
      { status: 400 }
    );
  }
}
