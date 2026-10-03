import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { renderJobOutput } from "../../../../../../lib/render/server-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params;
  const result = await renderJobOutput(jobId);
  if (!result) {
    return Response.json(
      { error: "Render output is not ready." },
      { status: 404 }
    );
  }

  const info = await stat(result.path);
  const stream = Readable.toWeb(
    createReadStream(result.path)
  ) as ReadableStream<Uint8Array>;

  return new Response(stream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(info.size),
      "Content-Disposition": `attachment; filename="nemdar-creative-${jobId}.mp4"`,
      "Cache-Control": "no-store",
    },
  });
}
