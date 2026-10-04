import { assets, projects, renderJobs, type Asset, type Project, type ProjectStatus, type RenderJob } from './data';

export interface ProjectsService { list(): Promise<Project[]>; create(name: string): Promise<Project> }
export interface CampaignsService { list(): Promise<{ id: string; name: string; stage: string }[]> }
export interface AssetsService { list(): Promise<Asset[]> }
export interface EditorService { load(projectId: string): Promise<{ project: Project; approval: string }> }
export interface GenerationService { capabilities(): Promise<string[]> }
export interface ProvidersService { health(): Promise<{ name: string; status: string }[]> }
export interface RenderService { list(): Promise<RenderJob[]>; retry(jobId: string): Promise<RenderJob> }
export interface PublishingService { connections(): Promise<{ name: string; status: string }[]> }
export interface AnalyticsService { summary(): Promise<{ spend: number; budget: number; currency: string }> }
export interface OperationsService { status(): Promise<string>; webhooks(): Promise<{ id: string; status: string }[]> }

export interface StudioServices {
  projects: ProjectsService;
  campaigns: CampaignsService;
  assets: AssetsService;
  editor: EditorService;
  generation: GenerationService;
  providers: ProvidersService;
  render: RenderService;
  publishing: PublishingService;
  analytics: AnalyticsService;
  operations: OperationsService;
}

export type ApiTransport = {
  request<T>(path: string, init?: RequestInit): Promise<T>;
};

export function createFetchTransport(options: {
  baseUrl?: string;
  headers?: HeadersInit | (() => HeadersInit);
  fetchImpl?: typeof fetch;
} = {}): ApiTransport {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async request<T>(path: string, init: RequestInit = {}) {
      const base = (options.baseUrl ?? '').replace(/\/$/, '');
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      const url = base ? `${base}${normalizedPath}` : normalizedPath;
      const suppliedHeaders =
        typeof options.headers === 'function' ? options.headers() : options.headers;
      const headers = new Headers(suppliedHeaders);
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
      const response = await fetchImpl(url, { ...init, headers });
      const contentType = response.headers.get('content-type') ?? '';
      const payload = contentType.includes('application/json')
        ? await response.json()
        : await response.text();
      if (!response.ok) {
        const message =
          typeof payload === 'object' && payload && 'error' in payload
            ? String((payload as { error?: unknown }).error)
            : `Request failed (${response.status})`;
        throw new Error(message);
      }
      return payload as T;
    },
  };
}

const FALLBACK_PROJECT: Project = projects[0] ?? {
  id: 'fallback',
  name: 'Untitled',
  type: 'Campaign video',
  ratio: '16:9',
  language: 'EN',
  status: 'Draft',
  updated: 'Just now',
  owner: 'Demo team',
  approval: 'Not requested',
  image: '',
  progress: 0,
};

export const MockAdapter: StudioServices = {
  projects: {
    list: async () => projects,
    create: async (name) => ({
      ...FALLBACK_PROJECT,
      id: `draft-${Date.now()}`,
      name,
      status: 'Draft',
      updated: 'Just now',
      owner: 'Demo team',
      approval: 'Not requested',
      progress: 0,
    }),
  },
  campaigns: {
    list: async () => [{ id: 'campaign-01', name: 'The Art of Presence', stage: 'Variants' }],
  },
  assets: { list: async () => assets },
  editor: {
    load: async (projectId) => ({
      project: projects.find((project) => project.id === projectId) ?? FALLBACK_PROJECT,
      approval: '2 of 3 approved',
    }),
  },
  generation: { capabilities: async () => ['Images', 'Video', 'Voice'] },
  providers: {
    health: async () => [
      { name: 'Image', status: 'Operational' },
      { name: 'Video', status: 'Operational' },
      { name: 'Voice', status: 'Operational' },
    ],
  },
  render: {
    list: async () => renderJobs,
    retry: async (jobId) =>
      renderJobs.find((job) => job.id === jobId) ?? {
        id: jobId,
        name: 'Render',
        status: 'Queued',
        progress: 0,
        priority: 'Normal',
        attempts: 1,
        worker: 'Pending',
        duration: '—',
      },
  },
  publishing: {
    connections: async () => [
      { name: 'Instagram', status: 'Available' },
      { name: 'TikTok', status: 'Available' },
      { name: 'LinkedIn', status: 'Available' },
    ],
  },
  analytics: { summary: async () => ({ spend: 310, budget: 500, currency: 'USD' }) },
  operations: {
    status: async () => 'Operational',
    webhooks: async () => [{ id: 'Demo endpoint', status: 'Healthy' }],
  },
};

type ExternalProject = {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'archived';
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

type ProviderSnapshot = {
  providers?: Array<{
    id: string;
    label: string;
    configured: boolean;
    capabilities: string[];
  }>;
};

type RenderApiJob = {
  jobId: string;
  status: string;
  progress: number;
  stage?: string;
  priority?: string;
  attempts?: number;
  maxAttempts?: number;
  workerId?: string;
  startedAt?: number;
  completedAt?: number;
  error?: string;
};

type PublishingConnector = {
  id: string;
  label: string;
  status: 'sandbox' | 'connected' | 'disconnected';
};

type OpsSnapshot = {
  budget?: {
    policy?: Record<string, unknown>;
    usage?: Record<string, unknown>;
    workspaceSpentUsd?: number;
    workspaceLimitUsd?: number;
  };
  audit?: Array<Record<string, unknown>>;
};

function textMetadata(metadata: Record<string, unknown> | undefined, key: string, fallback: string) {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function numberMetadata(metadata: Record<string, unknown> | undefined, key: string, fallback: number) {
  const value = metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function mapProjectStatus(status: ExternalProject['status']): ProjectStatus {
  if (status === 'active') return 'Approved';
  if (status === 'archived') return 'Published';
  return 'Draft';
}

function mapExternalProject(project: ExternalProject): Project {
  return {
    ...FALLBACK_PROJECT,
    id: project.id,
    name: project.name,
    type: textMetadata(project.metadata, 'type', 'Campaign project'),
    ratio: textMetadata(project.metadata, 'ratio', '16:9'),
    language: textMetadata(project.metadata, 'language', 'EN'),
    status: mapProjectStatus(project.status),
    updated: new Date(project.updatedAt).toLocaleString(),
    owner: textMetadata(project.metadata, 'owner', 'Workspace'),
    approval: textMetadata(project.metadata, 'approval', 'Not requested'),
    progress: numberMetadata(project.metadata, 'progress', 0),
  };
}

function renderDuration(job: RenderApiJob) {
  if (!job.startedAt || !job.completedAt) return '—';
  const seconds = Math.max(0, Math.round((job.completedAt - job.startedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function mapRenderJob(job: RenderApiJob): RenderJob {
  const status: RenderJob['status'] =
    job.status === 'succeeded'
      ? 'Complete'
      : job.status === 'running'
        ? 'Rendering'
        : job.status === 'failed'
          ? 'Failed'
          : 'Queued';
  return {
    id: job.jobId,
    name: job.stage?.trim() || `Render ${job.jobId.slice(0, 8)}`,
    status,
    progress: Number.isFinite(job.progress) ? job.progress : 0,
    priority: job.priority
      ? job.priority.charAt(0).toUpperCase() + job.priority.slice(1)
      : 'Normal',
    attempts: job.attempts ?? 0,
    worker: job.workerId ?? 'Pending',
    duration: renderDuration(job),
  };
}

function firstFiniteNumber(...values: unknown[]): number {
  return values.find(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  ) ?? 0;
}

function budgetNumbers(snapshot: OpsSnapshot): { spend: number; budget: number } {
  const budget = snapshot.budget ?? {};
  const policy = budget.policy ?? {};
  const usage = budget.usage ?? {};
  return {
    spend: firstFiniteNumber(
      budget.workspaceSpentUsd,
      usage['workspaceSpentUsd'],
      usage['spendUsd'],
    ),
    budget: firstFiniteNumber(
      budget.workspaceLimitUsd,
      policy['workspaceLimitUsd'],
      policy['workspaceBudgetUsd'],
      policy['monthlyBudgetUsd'],
    ),
  };
}

/**
 * Adapter for the existing NEMDAR Creative API.
 *
 * Browser-safe endpoints use `transport`. Authenticated `/api/v1/*` calls use
 * `serverTransport` so NEMDAR_API_KEY never enters client JavaScript.
 */
export class LocalApiAdapter implements StudioServices {
  constructor(
    private readonly transport: ApiTransport,
    private readonly serverTransport?: ApiTransport,
  ) {}

  projects: ProjectsService = {
    list: async () => {
      const payload = await this.transport.request<{ projects: ExternalProject[] }>('/api/workspace/projects');
      return (payload.projects ?? []).map(mapExternalProject);
    },
    create: async (name) => {
      const project = await this.transport.request<ExternalProject>('/api/workspace/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      return mapExternalProject(project);
    },
  };

  campaigns: CampaignsService = {
    list: async () => this.unavailable('Campaign persistence is still client/project-state backed.'),
  };

  assets: AssetsService = {
    list: async () => this.unavailable('Asset library persistence is still editor/browser-state backed.'),
  };

  editor: EditorService = {
    load: async (projectId) => {
      const payload = await this.transport.request<{ projects: ExternalProject[] }>('/api/workspace/projects');
      const project = (payload.projects ?? []).find((row) => row.id === projectId);
      const mapped = project ? mapExternalProject(project) : FALLBACK_PROJECT;
      return { project: mapped, approval: mapped.approval };
    },
  };

  generation: GenerationService = {
    capabilities: async () => {
      const snapshot = await this.transport.request<ProviderSnapshot>('/api/providers');
      const capabilities = new Set(
        (snapshot.providers ?? []).flatMap((provider) => provider.capabilities ?? []),
      );
      return [...capabilities];
    },
  };

  providers: ProvidersService = {
    health: async () => {
      const snapshot = await this.transport.request<ProviderSnapshot>('/api/providers');
      return (snapshot.providers ?? []).map((provider) => ({
        name: provider.label || provider.id,
        status: provider.configured ? 'Operational' : 'Unavailable',
      }));
    },
  };

  render: RenderService = {
    list: async () => {
      const payload = await this.transport.request<{ jobs: RenderApiJob[] }>('/api/render/jobs');
      return (payload.jobs ?? []).map(mapRenderJob);
    },
    retry: async (jobId) => {
      const job = await this.transport.request<RenderApiJob>(
        `/api/render/jobs/${encodeURIComponent(jobId)}`,
        { method: 'POST' },
      );
      return mapRenderJob(job);
    },
  };

  publishing: PublishingService = {
    connections: async () => {
      const payload = await this.transport.request<{ connectors: PublishingConnector[] }>(
        '/api/publishing/connectors',
      );
      return (payload.connectors ?? []).map((connector) => ({
        name: connector.label,
        status: connector.status === 'disconnected' ? 'Disconnected' : 'Available',
      }));
    },
  };

  analytics: AnalyticsService = {
    summary: async () => {
      const snapshot = await this.transport.request<OpsSnapshot>('/api/ops/control');
      return { ...budgetNumbers(snapshot), currency: 'USD' };
    },
  };

  operations: OperationsService = {
    status: async () => {
      await this.transport.request<OpsSnapshot>('/api/ops/control');
      return 'Operational';
    },
    webhooks: async () => {
      const secure = this.requireServerTransport('Webhook administration');
      const payload = await secure.request<{
        webhooks?: Array<{ id: string }>;
        subscriptions?: Array<{ id: string }>;
      }>('/api/v1/webhooks');
      const rows = payload.webhooks ?? payload.subscriptions ?? [];
      return rows.map((row) => ({ id: row.id, status: 'Configured' }));
    },
  };

  private requireServerTransport(capability: string) {
    if (!this.serverTransport) {
      throw new Error(
        `${capability} requires a server-side transport; credentials are intentionally not exposed to the browser.`,
      );
    }
    return this.serverTransport;
  }

  private unavailable<T>(reason: string): Promise<T> {
    return Promise.reject(new Error(reason));
  }
}

export function createBrowserLocalApiAdapter(baseUrl = '') {
  return new LocalApiAdapter(createFetchTransport({ baseUrl }));
}

export function createDefaultStudioServices(): StudioServices {
  const mode =
    typeof import.meta !== 'undefined'
      ? String(import.meta.env?.['VITE_NEMDAR_DATA_MODE'] ?? 'mock').toLowerCase()
      : 'mock';
  if (mode !== 'local') return MockAdapter;
  const baseUrl = String(import.meta.env?.['VITE_NEMDAR_API_BASE_URL'] ?? '');
  return createBrowserLocalApiAdapter(baseUrl);
}

export const studioServices: StudioServices = createDefaultStudioServices();
