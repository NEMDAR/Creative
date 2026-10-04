export type ExternalProjectStatus = "draft" | "active" | "archived";
export type ExternalJobType = "batch" | "render" | "publish";
export type ExternalJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";
export type WebhookEventType =
  | "project.created"
  | "job.created"
  | "job.status_changed";

export type ExternalProject = {
  id: string;
  name: string;
  status: ExternalProjectStatus;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type ExternalJob = {
  id: string;
  projectId: string;
  type: ExternalJobType;
  status: ExternalJobStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
};

export type WebhookSubscription = {
  id: string;
  url: string;
  eventTypes: WebhookEventType[];
  createdAt: number;
};

export type WebhookEvent = {
  id: string;
  subscriptionId: string;
  url: string;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
  deliveryStatus: "pending";
  createdAt: number;
};

type ExternalApiStore = {
  projects: Map<string, ExternalProject>;
  jobs: Map<string, ExternalJob>;
  webhooks: Map<string, WebhookSubscription>;
  events: WebhookEvent[];
};

const globalStore = globalThis as typeof globalThis & {
  __nemdarExternalApiStore?: ExternalApiStore;
};

export function getExternalApiStore(): ExternalApiStore {
  if (!globalStore.__nemdarExternalApiStore) {
    globalStore.__nemdarExternalApiStore = {
      projects: new Map(),
      jobs: new Map(),
      webhooks: new Map(),
      events: [],
    };
  }
  return globalStore.__nemdarExternalApiStore;
}

export function createExternalProject(input: {
  name: string;
  metadata?: Record<string, unknown>;
}): ExternalProject {
  const store = getExternalApiStore();
  const now = Date.now();
  const project: ExternalProject = {
    id: crypto.randomUUID(),
    name: input.name.trim() || "Untitled Project",
    status: "draft",
    metadata: input.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };
  store.projects.set(project.id, project);
  emitWebhookEvent("project.created", {
    projectId: project.id,
    status: project.status,
  });
  return project;
}

export function listExternalProjects() {
  return [...getExternalApiStore().projects.values()].sort(
    (a, b) => b.createdAt - a.createdAt
  );
}

export function getExternalProject(id: string) {
  return getExternalApiStore().projects.get(id) ?? null;
}

export function createExternalJob(input: {
  projectId: string;
  type: ExternalJobType;
  payload?: Record<string, unknown>;
}): ExternalJob {
  const store = getExternalApiStore();
  if (!store.projects.has(input.projectId)) {
    throw new Error("Project not found.");
  }
  if (!["batch", "render", "publish"].includes(input.type)) {
    throw new Error("Unsupported job type.");
  }

  const now = Date.now();
  const job: ExternalJob = {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    type: input.type,
    status: "queued",
    input: input.payload ?? {},
    output: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  store.jobs.set(job.id, job);
  emitWebhookEvent("job.created", {
    jobId: job.id,
    projectId: job.projectId,
    type: job.type,
    status: job.status,
  });
  return job;
}

export function listExternalJobs(projectId?: string) {
  return [...getExternalApiStore().jobs.values()]
    .filter((job) => !projectId || job.projectId === projectId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getExternalJob(id: string) {
  return getExternalApiStore().jobs.get(id) ?? null;
}

export function updateExternalJob(
  id: string,
  input: {
    status?: ExternalJobStatus;
    output?: Record<string, unknown> | null;
    error?: string | null;
  }
): ExternalJob {
  const store = getExternalApiStore();
  const current = store.jobs.get(id);
  if (!current) throw new Error("Job not found.");

  const nextStatus = input.status ?? current.status;
  if (
    !["queued", "running", "succeeded", "failed", "cancelled"].includes(
      nextStatus
    )
  ) {
    throw new Error("Unsupported job status.");
  }

  const next: ExternalJob = {
    ...current,
    status: nextStatus,
    output:
      input.output === undefined ? current.output : input.output,
    error: input.error === undefined ? current.error : input.error,
    updatedAt: Date.now(),
  };
  store.jobs.set(id, next);

  if (next.status !== current.status) {
    emitWebhookEvent("job.status_changed", {
      jobId: next.id,
      projectId: next.projectId,
      from: current.status,
      to: next.status,
    });
  }

  return next;
}

export function createWebhookSubscription(input: {
  url: string;
  eventTypes: WebhookEventType[];
}): WebhookSubscription {
  const url = input.url.trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("Webhook URL must use http or https.");
  }
  const eventTypes = [...new Set(input.eventTypes)].filter((eventType) =>
    ["project.created", "job.created", "job.status_changed"].includes(eventType)
  );
  if (!eventTypes.length) {
    throw new Error("At least one supported webhook event is required.");
  }

  const subscription: WebhookSubscription = {
    id: crypto.randomUUID(),
    url,
    eventTypes,
    createdAt: Date.now(),
  };
  getExternalApiStore().webhooks.set(subscription.id, subscription);
  return subscription;
}

export function listWebhookSubscriptions() {
  return [...getExternalApiStore().webhooks.values()].sort(
    (a, b) => b.createdAt - a.createdAt
  );
}

export function listWebhookEvents() {
  return [...getExternalApiStore().events].sort(
    (a, b) => b.createdAt - a.createdAt
  );
}

function emitWebhookEvent(
  eventType: WebhookEventType,
  payload: Record<string, unknown>
) {
  const store = getExternalApiStore();
  for (const subscription of store.webhooks.values()) {
    if (!subscription.eventTypes.includes(eventType)) continue;
    store.events.push({
      id: crypto.randomUUID(),
      subscriptionId: subscription.id,
      url: subscription.url,
      eventType,
      payload,
      deliveryStatus: "pending",
      createdAt: Date.now(),
    });
  }
  if (store.events.length > 500) {
    store.events.splice(0, store.events.length - 500);
  }
}
