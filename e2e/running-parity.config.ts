import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

// 합성 공개 러닝을 실제 홈·상세 경로에서 검증한다. Firebase 에뮬레이터만 사용한다.
export default defineConfig({
  testDir: "./tests",
  testMatch: "running-parity.spec.ts",
  workers: 1,
  reporter: "list",
  timeout: 45_000,
  outputDir: "../test-results/running-parity",
  use: { baseURL: "http://127.0.0.1:5190", channel: "chrome", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    command: "npx vite --mode e2e --host 127.0.0.1 --port 5190 --strictPort",
    url: "http://127.0.0.1:5190",
    reuseExistingServer: false,
  },
});
