import { rmSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const testPort = Number(process.env.NEMDAR_TEST_PORT ?? 3100);
const testBaseUrl = `http://127.0.0.1:${testPort}`;
const useProductionServer = process.env.NEMDAR_TEST_PRODUCTION === "1";
const testRenderQueueDir = join(process.cwd(), `.nemdar-render-test-${testPort}`);
const testOpsDir = join(process.cwd(), `.nemdar-ops-test-${testPort}`);
rmSync(testRenderQueueDir, { recursive: true, force: true });
rmSync(testOpsDir, { recursive: true, force: true });

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: testBaseUrl,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: useProductionServer
      ? `npm run start -- --hostname 127.0.0.1 --port ${testPort}`
      : `npm run dev -- --hostname 127.0.0.1 --port ${testPort}`,
    url: testBaseUrl,
    env: { CAPTION_PROVIDER: "mock", NEMDAR_API_KEY: "test-api-key", RENDER_FFMPEG_TIMEOUT_MS: "5000", RENDER_MAX_CONCURRENCY: "2", RENDER_QUEUE_DIR: testRenderQueueDir, NEMDAR_OPS_DIR: testOpsDir },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
