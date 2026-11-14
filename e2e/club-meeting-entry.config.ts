import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "club-meeting-entry.spec.ts", workers: 1,
  use: { baseURL: "http://127.0.0.1:18497" },
  projects: [{ name: "mobile", use: { viewport: { width: 390, height: 844 } } }, { name: "desktop", use: { viewport: { width: 1280, height: 900 } } }],
  webServer: { cwd: fileURLToPath(new URL("..", import.meta.url)), command: "node_modules/.bin/vite --config e2e/club-meeting-entry.vite.config.ts --host 127.0.0.1 --port 18497", url: "http://127.0.0.1:18497", reuseExistingServer: false },
});
