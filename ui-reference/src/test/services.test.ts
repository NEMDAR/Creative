import { describe, expect, it } from 'vitest';
import { LocalApiAdapter, type ApiTransport } from '@/features/nemdar/services';

function transport(routes: Record<string, unknown>): ApiTransport {
  return {
    async request<T>(path: string) {
      if (!(path in routes)) throw new Error(`Missing route: ${path}`);
      return routes[path] as T;
    },
  };
}

describe('LocalApiAdapter', () => {
  it('normalizes browser-safe provider, render, publishing and operations APIs', async () => {
    const api = new LocalApiAdapter(
      transport({
        '/api/providers': {
          providers: [
            { id: 'img', label: 'Image Fast', configured: true, capabilities: ['image'] },
            { id: 'vid', label: 'Video Offline', configured: false, capabilities: ['video'] },
          ],
        },
        '/api/render/jobs': {
          jobs: [
            {
              jobId: 'render-12345678',
              status: 'running',
              progress: 42,
              stage: 'Encoding MP4',
              priority: 'high',
              attempts: 1,
              workerId: 'worker-1',
              startedAt: 1000,
            },
          ],
        },
        '/api/publishing/connectors': {
          connectors: [
            { id: 'ig', label: 'Instagram Sandbox', status: 'sandbox' },
            { id: 'li', label: 'LinkedIn', status: 'disconnected' },
          ],
        },
        '/api/ops/control': {
          budget: {
            policy: { workspaceLimitUsd: 500 },
            usage: { workspaceSpentUsd: 125 },
          },
          audit: [],
        },
      }),
    );

    await expect(api.generation.capabilities()).resolves.toEqual(['image', 'video']);
    await expect(api.providers.health()).resolves.toEqual([
      { name: 'Image Fast', status: 'Operational' },
      { name: 'Video Offline', status: 'Unavailable' },
    ]);
    await expect(api.render.list()).resolves.toEqual([
      expect.objectContaining({
        id: 'render-12345678',
        status: 'Rendering',
        progress: 42,
        priority: 'High',
        attempts: 1,
        worker: 'worker-1',
      }),
    ]);
    await expect(api.publishing.connections()).resolves.toEqual([
      { name: 'Instagram Sandbox', status: 'Available' },
      { name: 'LinkedIn', status: 'Disconnected' },
    ]);
    await expect(api.analytics.summary()).resolves.toEqual({
      spend: 125,
      budget: 500,
      currency: 'USD',
    });
    await expect(api.operations.status()).resolves.toBe('Operational');
  });

  it('keeps webhook administration behind a server-side transport', async () => {
    const api = new LocalApiAdapter(transport({}));
    await expect(api.operations.webhooks()).rejects.toThrow(/server-side transport/i);
  });

  it('maps workspace projects through the browser-safe integration endpoint', async () => {
    const browser = transport({
      '/api/workspace/projects': {
        projects: [
          {
            id: 'p-real',
            name: 'Integrated Project',
            status: 'active',
            metadata: {
              type: 'Social campaign',
              ratio: '9:16',
              language: 'AR + EN',
              owner: 'NEMDAR',
              approval: 'Approved',
              progress: 74,
            },
            createdAt: 1,
            updatedAt: 2,
          },
        ],
      },
    });
    const api = new LocalApiAdapter(browser);
    const rows = await api.projects.list();
    expect(rows[0]).toEqual(
      expect.objectContaining({
        id: 'p-real',
        name: 'Integrated Project',
        status: 'Approved',
        ratio: '9:16',
        language: 'AR + EN',
        progress: 74,
      }),
    );
  });
});
