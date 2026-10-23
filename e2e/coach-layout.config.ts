import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

// Only isolated local fixtures. No auth state, emulator writes or production traffic.
export default defineConfig({
  testDir: "./component-tests",testMatch: "coach-layout.spec.ts",workers: 1,
  reporter: "list",timeout: 20000,outputDir: "../test-results/coach-layout",
  use: { baseURL: "http://127.0.0.1:5192",channel: "chrome",screenshot: "only-on-failure",colorScheme: "dark" },
  webServer: { cwd: fileURLToPath(new URL("..",import.meta.url)),command: "npx vite --config e2e/coach-layout.vite.config.ts --mode e2e --host 127.0.0.1 --port 5192 --strictPort",url: "http://127.0.0.1:5192",reuseExistingServer: false },
});
