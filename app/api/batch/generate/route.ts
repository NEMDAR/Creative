import { NextResponse } from "next/server";
import { normalizeBrandKit, type BrandKit } from "../../../../lib/editor/brand-kit";
import {
  generateBatchVariants,
  type BatchInputRow,
} from "../../../../lib/scale/batch";
import type { MarketingTemplateId } from "../../../../lib/editor/templates";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      rows?: BatchInputRow[];
      defaultTemplate?: MarketingTemplateId;
      brandKit?: BrandKit;
    };

    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json({ error: "rows are required." }, { status: 400 });
    }

    const result = generateBatchVariants(
      body.rows,
      body.defaultTemplate ?? "product-spotlight",
      normalizeBrandKit(body.brandKit)
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to generate batch.",
      },
      { status: 400 }
    );
  }
}
