import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

// Firebase emulator나 실제 계정 없이 공용 컴포넌트의 반응형/키보드 동작 검증.
export default defineConfig({
  testDir: "./component-tests", testMatch: "pmc-history.spec.ts", workers: 1,
  reporter: "list", outputDir: "../test-results/pmc-history",
  use: { baseURL: "http://127.0.0.1:5189", channel: "chrome", screenshot: "only-on-failure" },
  webServer: { cwd: fileURLToPath(new URL("..", import.meta.url)), command: "npx vite --mode e2e --host 127.0.0.1 --port 5189 --strictPort", url: "http://127.0.0.1:5189", reuseExistingServer: false },
});
