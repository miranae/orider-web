import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./component-tests", testMatch: "embedded-coach.spec.ts", workers: 1, timeout: 45000, reporter: "list", outputDir: "../test-results/embedded-coach",
  use: { baseURL: "http://127.0.0.1:5194", channel: "chrome", screenshot: "only-on-failure", colorScheme: "dark" },
  webServer: { cwd: fileURLToPath(new URL("..", import.meta.url)), command: "npx vite --config e2e/embedded-coach.vite.config.ts --mode e2e --host 127.0.0.1 --port 5194 --strictPort", url: "http://127.0.0.1:5194", reuseExistingServer: false },
});
