import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const policyMode = process.env.WORLD_LOCAL_WEB_POLICY === "1";
const webPort = policyMode ? 19471 : 19468;

export default defineConfig({
  testDir: "./tests",
  testMatch: "ride-world-local.spec.ts",
  timeout: 20_000,
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${webPort}` },
  webServer: {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    reuseExistingServer: !process.env.CI,
    command: `npx vite --host 127.0.0.1 --port ${webPort} --strictPort`,
    env: { VITE_ORIDER_LOCAL_WORLD: "1", VITE_ORIDER_LOCAL_WORLD_PORT: policyMode ? "19466" : "18766" },
    url: `http://127.0.0.1:${webPort}/e2e/fixtures/ride-world.html`,
  },
});
