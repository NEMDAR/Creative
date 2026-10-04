import { NextResponse } from "next/server";
import { authorizeExternalApi } from "../../../../../lib/scale/api-auth";
import { getExternalProject } from "../../../../../lib/scale/api-store";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = authorizeExternalApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await context.params;
  const project = getExternalProject(id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json(project);
}
