import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { assets as fixtureAssets, projects as fixtureProjects, renderJobs as fixtureRenderJobs, type Asset, type Project, type RenderJob } from './data';
import { studioServices, type StudioServices } from './services';

export type StudioData = {
  projects: Project[];
  assets: Asset[];
  renderJobs: RenderJob[];
  providerHealth: Array<{ name: string; status: string }>;
  publishingConnections: Array<{ name: string; status: string }>;
  analytics: { spend: number; budget: number; currency: string };
  operationsStatus: string;
  webhookHealth: Array<{ id: string; status: string }>;
  loading: boolean;
  errors: Record<string, string>;
};

type StudioContextValue = StudioData & {
  services: StudioServices;
  refresh(): Promise<void>;
};

const initialData: StudioData = {
  projects: fixtureProjects,
  assets: fixtureAssets,
  renderJobs: fixtureRenderJobs,
  providerHealth: [
    { name: 'Image', status: 'Operational' },
    { name: 'Video', status: 'Operational' },
    { name: 'Voice', status: 'Operational' },
  ],
  publishingConnections: [
    { name: 'Instagram', status: 'Available' },
    { name: 'TikTok', status: 'Available' },
    { name: 'LinkedIn', status: 'Available' },
  ],
  analytics: { spend: 310, budget: 500, currency: 'USD' },
  operationsStatus: 'Operational',
  webhookHealth: [{ id: 'Demo endpoint', status: 'Healthy' }],
  loading: false,
  errors: {},
};

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioServicesProvider({
  children,
  services = studioServices,
}: {
  children: ReactNode;
  services?: StudioServices;
}) {
  const [data, setData] = useState<StudioData>(initialData);

  const refresh = useCallback(async () => {
    setData((current) => ({ ...current, loading: true }));
    const tasks = {
      projects: services.projects.list(),
      assets: services.assets.list(),
      renderJobs: services.render.list(),
      providerHealth: services.providers.health(),
      publishingConnections: services.publishing.connections(),
      analytics: services.analytics.summary(),
      operationsStatus: services.operations.status(),
      webhookHealth: services.operations.webhooks(),
    };
    const keys = Object.keys(tasks) as Array<keyof typeof tasks>;
    const results = await Promise.allSettled(keys.map((key) => tasks[key]));
    setData((current) => {
      const next: StudioData = { ...current, loading: false, errors: {} };
      results.forEach((result, index) => {
        const key = keys[index]!;
        if (result.status === 'fulfilled') {
          (next as Record<string, unknown>)[key] = result.value;
        } else {
          next.errors[key] =
            result.reason instanceof Error ? result.reason.message : String(result.reason);
        }
      });
      return next;
    });
  }, [services]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ ...data, services, refresh }),
    [data, services, refresh],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudioData() {
  const value = useContext(StudioContext);
  if (!value) throw new Error('useStudioData must be used inside StudioServicesProvider.');
  return value;
}
