import { analyzeSilence } from "../../../../lib/media/silence-analyzer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 100 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const media = form.get("media");
    if (!(media instanceof File)) {
      return Response.json({ error: "A media file is required." }, { status: 400 });
    }
    if (media.size > MAX_BYTES) {
      return Response.json(
        { error: "Silence analysis input exceeds 100 MB." },
        { status: 413 }
      );
    }

    const thresholdDb = Number(form.get("thresholdDb") ?? -40);
    const minDuration = Number(form.get("minDuration") ?? 0.35);

    const result = await analyzeSilence(
      media,
      Number.isFinite(thresholdDb) ? thresholdDb : -40,
      Number.isFinite(minDuration) ? minDuration : 0.35
    );

    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to analyze silence.",
      },
      { status: 500 }
    );
  }
}
