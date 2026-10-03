import { randomUUID } from "node:crypto";
import type {
  CaptionLanguage,
  CaptionTrack,
} from "../editor/captions";

export type CaptionTranscriptionInput = {
  file: File;
  language: CaptionLanguage;
  duration?: number;
};

export interface CaptionProvider {
  readonly id: string;
  transcribe(input: CaptionTranscriptionInput): Promise<CaptionTrack>;
}

type WhisperVerboseResponse = {
  duration?: number;
  language?: string;
  text?: string;
  segments?: Array<{
    id?: number;
    start?: number;
    end?: number;
    text?: string;
  }>;
};

class OpenAICaptionProvider implements CaptionProvider {
  readonly id = "openai";

  async transcribe(input: CaptionTranscriptionInput): Promise<CaptionTrack> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is required when CAPTION_PROVIDER=openai."
      );
    }

    const model =
      process.env.OPENAI_CAPTION_MODEL?.trim() || "whisper-1";
    const form = new FormData();
    form.append("file", input.file, input.file.name || "media.webm");
    form.append("model", model);
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
    if (input.language && input.language !== "auto") {
      form.append("language", input.language);
    }

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: form,
      }
    );

    const body = (await response.json().catch(() => null)) as
      | WhisperVerboseResponse
      | { error?: { message?: string } }
      | null;

    if (!response.ok) {
      const message =
        body &&
        "error" in body &&
        body.error?.message
          ? body.error.message
          : `OpenAI transcription failed with HTTP ${response.status}.`;
      throw new Error(message);
    }

    const verbose = body as WhisperVerboseResponse;
    const detectedLanguage =
      verbose.language ||
      (input.language !== "auto" ? input.language : "und");
    const segments = verbose.segments ?? [];

    if (segments.length === 0 && verbose.text?.trim()) {
      const duration = Math.max(
        0.1,
        Number(verbose.duration ?? input.duration ?? 5)
      );
      segments.push({
        id: 0,
        start: 0,
        end: duration,
        text: verbose.text,
      });
    }

    return {
      provider: this.id,
      model,
      requestedLanguage: input.language,
      detectedLanguage,
      generatedAt: Date.now(),
      cues: segments
        .map((segment, index) => ({
          id: `caption-${segment.id ?? index}-${randomUUID()}`,
          startTime: Math.max(0, Number(segment.start ?? 0)),
          endTime: Math.max(
            Number(segment.start ?? 0) + 0.05,
            Number(segment.end ?? segment.start ?? 0)
          ),
          text: String(segment.text ?? "").trim(),
          language: detectedLanguage,
        }))
        .filter((cue) => cue.text.length > 0),
    };
  }
}

class MockCaptionProvider implements CaptionProvider {
  readonly id = "mock";

  async transcribe(input: CaptionTranscriptionInput): Promise<CaptionTrack> {
    const language =
      input.language === "auto" ? "ar" : input.language || "ar";
    const duration = Math.max(3, input.duration ?? 6);
    const texts =
      language === "en"
        ? [
            "Welcome to NEMDAR Creative Studio",
            "Edit smarter with timed captions",
            "Your marketing video is ready",
          ]
        : [
            "مرحبًا بك في نمدار كريتيف ستوديو",
            "عدّل الفيديو بذكاء مع كابتشن تلقائي",
            "فيديو التسويق أصبح جاهزًا",
          ];
    const slice = duration / texts.length;

    return {
      provider: this.id,
      model: "mock-caption-v1",
      requestedLanguage: input.language,
      detectedLanguage: language,
      generatedAt: Date.now(),
      cues: texts.map((text, index) => ({
        id: `caption-mock-${index}-${randomUUID()}`,
        startTime: Number((index * slice).toFixed(2)),
        endTime: Number(
          (index === texts.length - 1
            ? duration
            : (index + 1) * slice
          ).toFixed(2)
        ),
        text,
        language,
      })),
    };
  }
}

export function getCaptionProvider(): CaptionProvider {
  const configured =
    process.env.CAPTION_PROVIDER?.trim().toLowerCase() || "openai";
  if (configured === "mock") return new MockCaptionProvider();
  if (configured === "openai") return new OpenAICaptionProvider();
  throw new Error(`Unsupported CAPTION_PROVIDER: ${configured}`);
}
