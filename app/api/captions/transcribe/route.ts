import { getCaptionProvider } from "../../../../lib/captions/providers";
import type { CaptionLanguage } from "../../../../lib/editor/captions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const media = form.get("media");
    if (!(media instanceof File)) {
      return Response.json(
        { error: "A media file is required." },
        { status: 400 }
      );
    }
    if (media.size > MAX_BYTES) {
      return Response.json(
        { error: "Caption transcription input exceeds the 25 MB API limit." },
        { status: 413 }
      );
    }

    const requestedLanguage =
      String(form.get("language") || "auto") as CaptionLanguage;
    const duration = Number(form.get("duration") || 0);

    const provider = getCaptionProvider();
    const track = await provider.transcribe({
      file: media,
      language: requestedLanguage,
      duration: Number.isFinite(duration) ? duration : undefined,
    });

    return Response.json(track);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to generate captions.",
      },
      { status: 500 }
    );
  }
}
