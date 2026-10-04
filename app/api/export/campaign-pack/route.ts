import JSZip from "jszip";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const manifestRaw = form.get("manifest");
    if (typeof manifestRaw !== "string") {
      return Response.json({ error: "manifest is required." }, { status: 400 });
    }

    const manifest = JSON.parse(manifestRaw) as Record<string, unknown>;
    const project = manifest.project as { name?: string } | undefined;
    const zip = new JSZip();

    zip.file("manifest.json", pretty(manifest));
    zip.file("project/project.json", pretty(manifest.project ?? null));
    zip.file("project/storyboard.json", pretty(manifest.storyboard ?? null));
    zip.file("project/captions.json", pretty(manifest.captions ?? null));
    zip.file("project/brand-kit.json", pretty(manifest.brandKit ?? null));
    zip.file("copy/marketing-brief.json", pretty(manifest.marketingBrief ?? null));
    zip.file("copy/concepts.json", pretty(manifest.creativeConcepts ?? []));
    zip.file("copy/language-variants.json", pretty(manifest.languageVariants ?? []));
    zip.file("copy/experiments.json", pretty(manifest.campaignExperiments ?? []));
    zip.file("variants/platform-variants.json", pretty(manifest.campaignVariants ?? []));
    zip.file("ai/generation-ledger.json", pretty(manifest.generationLedger ?? []));
    zip.file(
      "README.txt",
      [
        "NEMDAR Creator — Campaign Pack",
        "",
        `Project: ${project?.name ?? "Untitled Creative"}`,
        `Exported: ${String(manifest.exportedAt ?? "")}`,
        "",
        "Folders:",
        "- assets/: visual and audio source assets",
        "- copy/: campaign brief, concepts, language variants and experiments",
        "- project/: editable composition, storyboard, captions and Brand Kit",
        "- variants/: platform adaptation manifest",
        "- ai/: provider/model/cost/provenance ledger",
      ].join("\n")
    );

    for (const [key, value] of form.entries()) {
      if (!key.startsWith("asset:") || !(value instanceof File)) continue;
      const filename = sanitize(value.name || key.slice("asset:".length));
      zip.file(`assets/${filename}`, Buffer.from(await value.arrayBuffer()));
    }

    const bytes = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const filename = `${sanitize(project?.name ?? "campaign-pack") || "campaign-pack"}-campaign-pack.zip`;
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to export campaign pack.",
      },
      { status: 400 }
    );
  }
}

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function sanitize(value: string) {
  return value
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}
