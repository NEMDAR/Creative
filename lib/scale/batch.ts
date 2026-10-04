import { instantiateMarketingTemplate, type MarketingTemplateId } from "../editor/templates";
import type { BrandKit } from "../editor/brand-kit";
import type { CreatorProject, RatioKey } from "../editor/types";

export const MAX_BATCH_ROWS = 25;

export type BatchInputRow = {
  name?: string;
  template?: MarketingTemplateId;
  headline?: string;
  body?: string;
  cta?: string;
  ratio?: RatioKey;
  language?: "ar" | "en";
};

export type BatchProjectVariant = {
  id: string;
  rowIndex: number;
  status: "ready" | "invalid";
  errors: string[];
  source: BatchInputRow;
  project: CreatorProject | null;
};

export type BatchGenerationResult = {
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  truncatedRows: number;
  variants: BatchProjectVariant[];
};

const TEMPLATE_IDS: MarketingTemplateId[] = [
  "product-spotlight",
  "offer-stack",
  "testimonial",
];

const RATIOS: RatioKey[] = ["9:16", "1:1", "4:5", "16:9"];

export function parseBatchCsv(csv: string): BatchInputRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((item) => item.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const record = Object.fromEntries(
      headers.map((header, index) => [header, values[index]?.trim() ?? ""])
    );

    return {
      name: record.name || undefined,
      template: record.template as MarketingTemplateId | undefined,
      headline: record.headline || undefined,
      body: record.body || undefined,
      cta: record.cta || undefined,
      ratio: record.ratio as RatioKey | undefined,
      language: record.language as "ar" | "en" | undefined,
    };
  });
}

export function generateBatchVariants(
  rows: BatchInputRow[],
  defaultTemplate: MarketingTemplateId,
  brandKit: BrandKit
): BatchGenerationResult {
  const boundedRows = rows.slice(0, MAX_BATCH_ROWS);
  const variants = boundedRows.map((row, index) =>
    generateBatchVariant(row, index, defaultTemplate, brandKit)
  );

  return {
    totalRows: rows.length,
    acceptedRows: variants.filter((item) => item.status === "ready").length,
    rejectedRows: variants.filter((item) => item.status === "invalid").length,
    truncatedRows: Math.max(0, rows.length - MAX_BATCH_ROWS),
    variants,
  };
}

function generateBatchVariant(
  row: BatchInputRow,
  index: number,
  defaultTemplate: MarketingTemplateId,
  brandKit: BrandKit
): BatchProjectVariant {
  const errors: string[] = [];
  const templateId = row.template || defaultTemplate;

  if (!TEMPLATE_IDS.includes(templateId)) {
    errors.push(`Unsupported template: ${templateId}`);
  }
  if (row.ratio && !RATIOS.includes(row.ratio)) {
    errors.push(`Unsupported ratio: ${row.ratio}`);
  }
  if (row.language && row.language !== "ar" && row.language !== "en") {
    errors.push(`Unsupported language: ${row.language}`);
  }
  if (!row.headline?.trim() && !row.body?.trim() && !row.cta?.trim()) {
    errors.push("At least one of headline, body or cta is required.");
  }

  if (errors.length) {
    return {
      id: crypto.randomUUID(),
      rowIndex: index + 1,
      status: "invalid",
      errors,
      source: row,
      project: null,
    };
  }

  const instantiated = instantiateMarketingTemplate(templateId, brandKit);
  const direction = row.language === "ar" ? "rtl" : "ltr";
  const project: CreatorProject = {
    ...structuredClone(instantiated.project),
    name: row.name?.trim() || `Batch ${index + 1} - ${instantiated.definition.name}`,
    ratio: row.ratio ?? instantiated.project.ratio,
    overlays: instantiated.project.overlays.map((overlay) => {
      if (overlay.kind !== "text") return overlay;
      if (overlay.id === "template-headline" && row.headline?.trim()) {
        return { ...overlay, text: row.headline.trim(), direction };
      }
      if (overlay.id === "template-body" && row.body?.trim()) {
        return { ...overlay, text: row.body.trim(), direction };
      }
      if (overlay.id === "template-cta" && row.cta?.trim()) {
        return { ...overlay, text: row.cta.trim(), direction };
      }
      return { ...overlay, direction };
    }),
  };

  return {
    id: crypto.randomUUID(),
    rowIndex: index + 1,
    status: "ready",
    errors: [],
    source: row,
    project,
  };
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}
