import { NextResponse } from "next/server";
import { generateMediaProxy, type ProxyKind } from "../../../lib/media/proxy-generator";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const kind = form.get("kind");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required." }, { status: 400 });
    }
    if (kind !== "image" && kind !== "video") {
      return NextResponse.json({ error: "kind must be image or video." }, { status: 400 });
    }

    const result = await generateMediaProxy({
      bytes: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      kind: kind as ProxyKind,
    });

    return new Response(new Uint8Array(result.bytes), {
      status: 200,
      headers: {
        "content-type": result.mimeType,
        "cache-control": "private, max-age=31536000, immutable",
        "x-nemdar-proxy-cache-key": result.cacheKey,
        "x-nemdar-source-bytes": String(result.sourceBytes),
        "x-nemdar-proxy-bytes": String(result.proxyBytes),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create proxy." },
      { status: 500 }
    );
  }
}
