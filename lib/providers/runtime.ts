import { createMockProvider } from "./mock";
import { ProviderRouter } from "./router";

type GlobalWithProviderRouter = typeof globalThis & {
  __nemdarProviderRouter?: ProviderRouter;
};

const globalRouter = globalThis as GlobalWithProviderRouter;

export function getProviderRouter() {
  if (!globalRouter.__nemdarProviderRouter) {
    globalRouter.__nemdarProviderRouter = createProviderRouter();
  }
  return globalRouter.__nemdarProviderRouter;
}

function createProviderRouter() {
  return new ProviderRouter({
    image: process.env.AI_IMAGE_PROVIDER,
    video: process.env.AI_VIDEO_PROVIDER,
    voice: process.env.AI_VOICE_PROVIDER,
  })
    .register(
      createMockProvider({
        id: "mock-fast",
        label: "Mock Fast",
        tier: "fast",
      })
    )
    .register(
      createMockProvider({
        id: "mock-quality",
        label: "Mock Quality",
        tier: "quality",
      })
    );
}
