import { analyzeScenes } from "../../../../lib/media/scene-analyzer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 100 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const media = form.get("media");
    if (!(media instanceof File)) {
      return Response.json({ error: "A video file is required." }, { status: 400 });
    }
    if (media.size > MAX_BYTES) {
      return Response.json(
        { error: "Scene analysis input exceeds 100 MB." },
        { status: 413 }
      );
    }

    const threshold = Number(form.get("threshold") ?? 0.35);
    const result = await analyzeScenes(
      media,
      Number.isFinite(threshold)
        ? Math.max(0.05, Math.min(0.9, threshold))
        : 0.35
    );

    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to analyze scenes.",
      },
      { status: 500 }
    );
  }
}
