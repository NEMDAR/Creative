import { assets, projects, renderJobs, type Asset, type Project, type RenderJob } from './data';

/** Frontend contracts. Local adoption supplies a transport and real responses; preview never calls an API. */
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
  projects: ProjectsService; campaigns: CampaignsService; assets: AssetsService;
  editor: EditorService; generation: GenerationService; providers: ProvidersService;
  render: RenderService; publishing: PublishingService; analytics: AnalyticsService;
  operations: OperationsService;
}
export const MockAdapter: StudioServices = {
  projects: { list: async () => projects, create: async (name) => ({ ...projects[0] ?? { id: '', name, type: 'Campaign video', ratio: '16:9', language: 'EN', status: 'Draft' as const, updated: 'Just now', owner: 'Demo team', approval: 'Not requested', image: '', progress: 0 }, id: `draft-${Date.now()}`, name, status: 'Draft', updated: 'Just now', owner: 'Demo team', approval: 'Not requested', progress: 0 }) },
  campaigns: { list: async () => [{ id: 'campaign-01', name: 'The Art of Presence', stage: 'Variants' }] },
  assets: { list: async () => assets },
  editor: { load: async (projectId) => ({ project: projects.find(p => p.id === projectId) ?? projects[0] ?? { id: projectId, name: 'Untitled', type: 'Campaign video', ratio: '16:9', language: 'EN', status: 'Draft', updated: 'Just now', owner: 'Demo team', approval: 'Not requested', image: '', progress: 0 }, approval: '2 of 3 approved' }) },
  generation: { capabilities: async () => ['Images', 'Video', 'Voice'] },
  providers: { health: async () => [{ name: 'Image', status: 'Operational' }, { name: 'Video', status: 'Operational' }, { name: 'Voice', status: 'Operational' }] },
  render: { list: async () => renderJobs, retry: async (jobId) => renderJobs.find(j => j.id === jobId) ?? { id: jobId, name: 'Render', status: 'Queued', progress: 0, priority: 'Normal', attempts: 1, worker: 'Pending', duration: '—' } },
  publishing: { connections: async () => [{ name: 'Instagram', status: 'Available' }, { name: 'TikTok', status: 'Available' }, { name: 'LinkedIn', status: 'Available' }] },
  analytics: { summary: async () => ({ spend: 310, budget: 500, currency: 'USD' }) },
  operations: { status: async () => 'Operational', webhooks: async () => [{ id: 'Demo endpoint', status: 'Healthy' }] },
};

/** Placeholder only. Deliberately no transport or calls until existing local contracts are mapped. */
export class LocalApiAdapter implements StudioServices {
  // /api/v1/projects
  projects: ProjectsService = { list: () => this.unavailable(), create: () => this.unavailable() };
  // /api/v1/projects and campaign-related project resources
  campaigns: CampaignsService = { list: () => this.unavailable() };
  // /api/proxy and asset resources
  assets: AssetsService = { list: () => this.unavailable() };
  // /api/v1/projects/:id
  editor: EditorService = { load: () => this.unavailable() };
  // /api/generate/*
  generation: GenerationService = { capabilities: () => this.unavailable() };
  // /api/providers
  providers: ProvidersService = { health: () => this.unavailable() };
  // /api/render/jobs and /api/v1/jobs
  render: RenderService = { list: () => this.unavailable(), retry: () => this.unavailable() };
  // /api/publishing/*
  publishing: PublishingService = { connections: () => this.unavailable() };
  // /api/v1/projects and reporting resources, subject to local endpoint mapping
  analytics: AnalyticsService = { summary: () => this.unavailable() };
  // /api/ops/control and /api/v1/webhooks
  operations: OperationsService = { status: () => this.unavailable(), webhooks: () => this.unavailable() };
  private unavailable<T>(): Promise<T> { return Promise.reject(new Error('Local API mapping is not configured')); }
}
export const studioServices: StudioServices = MockAdapter;