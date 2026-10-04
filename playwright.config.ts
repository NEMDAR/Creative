import { rmSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const testRenderQueueDir = join(process.cwd(), ".nemdar-render-test");
const testOpsDir = join(process.cwd(), ".nemdar-ops-test");
rmSync(testRenderQueueDir, { recursive: true, force: true });
rmSync(testOpsDir, { recursive: true, force: true });

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    env: { CAPTION_PROVIDER: "mock", NEMDAR_API_KEY: "test-api-key", RENDER_FFMPEG_TIMEOUT_MS: "5000", RENDER_MAX_CONCURRENCY: "2", RENDER_QUEUE_DIR: testRenderQueueDir, NEMDAR_OPS_DIR: testOpsDir },
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
