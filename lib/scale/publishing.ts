export type PublishingChannel =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "linkedin"
  | "youtube"
  | "x";

export type PublishingConnector = {
  id: string;
  label: string;
  channel: PublishingChannel;
  status: "sandbox" | "connected" | "disconnected";
  workspaceScope: string;
  capabilities: Array<"publish" | "schedule">;
};

export type PublishingHandoff = {
  id: string;
  connectorId: string;
  channel: PublishingChannel;
  workspaceId: string;
  accountId: string;
  projectName: string;
  caption: string;
  assetName: string | null;
  scheduledAt: string | null;
  status: "ready" | "scheduled" | "sent";
  createdAt: number;
};

export const PUBLISHING_CONNECTORS: PublishingConnector[] = [
  {
    id: "nemdar-sandbox-instagram",
    label: "Instagram Sandbox",
    channel: "instagram",
    status: "sandbox",
    workspaceScope: "nemdar-local",
    capabilities: ["publish", "schedule"],
  },
  {
    id: "nemdar-sandbox-facebook",
    label: "Facebook Sandbox",
    channel: "facebook",
    status: "sandbox",
    workspaceScope: "nemdar-local",
    capabilities: ["publish", "schedule"],
  },
  {
    id: "nemdar-sandbox-tiktok",
    label: "TikTok Sandbox",
    channel: "tiktok",
    status: "sandbox",
    workspaceScope: "nemdar-local",
    capabilities: ["publish", "schedule"],
  },
  {
    id: "nemdar-sandbox-linkedin",
    label: "LinkedIn Sandbox",
    channel: "linkedin",
    status: "sandbox",
    workspaceScope: "nemdar-local",
    capabilities: ["publish", "schedule"],
  },
  {
    id: "nemdar-sandbox-youtube",
    label: "YouTube Sandbox",
    channel: "youtube",
    status: "sandbox",
    workspaceScope: "nemdar-local",
    capabilities: ["publish", "schedule"],
  },
];

export type PublishingHandoffInput = {
  connectorId: string;
  workspaceId: string;
  accountId: string;
  projectName: string;
  caption?: string;
  assetName?: string | null;
  scheduledAt?: string | null;
  approved: boolean;
};

export function createPublishingHandoff(
  input: PublishingHandoffInput
): PublishingHandoff {
  if (!input.approved) {
    throw new Error("Project approval is required before publishing handoff.");
  }

  const connector = PUBLISHING_CONNECTORS.find(
    (item) => item.id === input.connectorId
  );
  if (!connector || connector.status === "disconnected") {
    throw new Error("Publishing connector is unavailable.");
  }

  const workspaceId = input.workspaceId.trim();
  const accountId = input.accountId.trim();
  if (!workspaceId) throw new Error("workspaceId is required.");
  if (!accountId) throw new Error("accountId is required.");

  const normalizedSchedule = input.scheduledAt?.trim() || null;
  if (
    normalizedSchedule &&
    !connector.capabilities.includes("schedule")
  ) {
    throw new Error("Selected connector does not support scheduling.");
  }

  if (
    normalizedSchedule &&
    !Number.isFinite(new Date(normalizedSchedule).getTime())
  ) {
    throw new Error("scheduledAt is invalid.");
  }

  return {
    id: crypto.randomUUID(),
    connectorId: connector.id,
    channel: connector.channel,
    workspaceId,
    accountId,
    projectName: input.projectName.trim() || "Untitled Creative",
    caption: input.caption?.trim() ?? "",
    assetName: input.assetName?.trim() || null,
    scheduledAt: normalizedSchedule,
    status: normalizedSchedule ? "scheduled" : "ready",
    createdAt: Date.now(),
  };
}
