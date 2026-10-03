import type { RatioKey } from "./types";

export type EditorCommandAction =
  | { type: "set_ratio"; ratio: RatioKey }
  | { type: "add_text"; text: string }
  | { type: "set_muted"; muted: boolean }
  | { type: "rename_project"; name: string }
  | { type: "delete_selected_overlay"; overlayId: string };

export type EditorCommandPlan = {
  source: string;
  actions: EditorCommandAction[];
  summary: string[];
};

export type EditorCommandContext = {
  selectedOverlayId: string | null;
};

const RATIOS: RatioKey[] = ["9:16", "1:1", "4:5", "16:9"];

export function compileEditorCommand(
  source: string,
  context: EditorCommandContext
): { plan: EditorCommandPlan | null; error: string | null } {
  const trimmed = source.trim();
  if (!trimmed) {
    return { plan: null, error: "Enter an edit command first." };
  }

  const clauses = trimmed
    .split(/\s*(?:;|\bthen\b|ثم)\s*/i)
    .map((item) => item.trim())
    .filter(Boolean);

  const actions: EditorCommandAction[] = [];
  const errors: string[] = [];

  for (const clause of clauses) {
    const parsed = parseClause(clause, context);
    if (parsed.action) actions.push(parsed.action);
    else if (parsed.error) errors.push(parsed.error);
  }

  if (errors.length > 0) {
    return { plan: null, error: errors.join(" ") };
  }
  if (actions.length === 0) {
    return {
      plan: null,
      error:
        "Command not recognized. Try: set ratio to 4:5; add text: Limited offer; mute video.",
    };
  }

  return {
    plan: {
      source: trimmed,
      actions,
      summary: actions.map(describeEditorCommandAction),
    },
    error: null,
  };
}

export function describeEditorCommandAction(action: EditorCommandAction) {
  switch (action.type) {
    case "set_ratio":
      return `Set canvas ratio to ${action.ratio}`;
    case "add_text":
      return `Add text “${action.text}”`;
    case "set_muted":
      return action.muted ? "Mute project audio" : "Unmute project audio";
    case "rename_project":
      return `Rename project to “${action.name}”`;
    case "delete_selected_overlay":
      return "Delete the selected overlay";
  }
}

function parseClause(
  clause: string,
  context: EditorCommandContext
): { action: EditorCommandAction | null; error: string | null } {
  const lower = clause.toLowerCase();

  if (
    /(?:ratio|aspect|format|المقاس|الأبعاد|الابعاد|نسبة)/i.test(clause) ||
    RATIOS.some((ratio) => lower === ratio)
  ) {
    const ratio = RATIOS.find((item) => clause.includes(item));
    if (!ratio) {
      return {
        action: null,
        error: "Ratio command must use 9:16, 1:1, 4:5 or 16:9.",
      };
    }
    return { action: { type: "set_ratio", ratio }, error: null };
  }

  const addTextMatch =
    clause.match(/^(?:add\s+text|insert\s+text|text|أضف\s+نص|اضف\s+نص|اكتب)\s*[:\-]?\s*(.+)$/i);
  if (addTextMatch) {
    const text = addTextMatch[1].trim();
    if (!text) {
      return { action: null, error: "Add-text command needs text content." };
    }
    return { action: { type: "add_text", text }, error: null };
  }

  const renameMatch =
    clause.match(/^(?:rename\s+(?:project\s+)?to|project\s+name\s*[:\-]|اسم\s+المشروع\s*[:\-]?|سم\s+المشروع)\s*(.+)$/i);
  if (renameMatch) {
    const name = renameMatch[1].trim();
    if (!name) {
      return { action: null, error: "Rename command needs a project name." };
    }
    return { action: { type: "rename_project", name }, error: null };
  }

  if (/^(?:mute(?:\s+video|\s+audio)?|اكتم(?:\s+الصوت)?)$/i.test(clause)) {
    return { action: { type: "set_muted", muted: true }, error: null };
  }

  if (/^(?:unmute(?:\s+video|\s+audio)?|شغل\s+الصوت|فعّل\s+الصوت|فعل\s+الصوت)$/i.test(clause)) {
    return { action: { type: "set_muted", muted: false }, error: null };
  }

  if (
    /^(?:delete\s+selected(?:\s+overlay|\s+text)?|remove\s+selected(?:\s+overlay|\s+text)?|احذف\s+العنصر\s+المحدد)$/i.test(
      clause
    )
  ) {
    if (!context.selectedOverlayId) {
      return {
        action: null,
        error: "Select an overlay before asking to delete it.",
      };
    }
    return {
      action: {
        type: "delete_selected_overlay",
        overlayId: context.selectedOverlayId,
      },
      error: null,
    };
  }

  return {
    action: null,
    error: `Unsupported command: “${clause}”.`,
  };
}
