import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

// Isolated demo emulators only. Do not run against a shared emulator or real Firebase project.
export default defineConfig({
  testDir: "./component-tests",testMatch: "coach-app-local.spec.ts",workers: 1,timeout: 30000,expect: { timeout: 15000 },reporter: "list",outputDir: "../test-results/coach-app-local",
  use: { baseURL: "http://127.0.0.1:5193",channel: "chrome",colorScheme: "dark",screenshot: "only-on-failure" },
  webServer: {
    cwd: fileURLToPath(new URL("..",import.meta.url)),command: "npx vite --mode e2e --host 127.0.0.1 --port 5193 --strictPort",url: "http://127.0.0.1:5193",reuseExistingServer: false,
    env: { VITE_USE_EMULATORS: "true",VITE_FIREBASE_API_KEY: "fake-local-key",VITE_FIREBASE_PROJECT_ID: "demo-orider-coach-local",VITE_FIREBASE_AUTH_DOMAIN: "demo-orider-coach-local.firebaseapp.com",VITE_FIREBASE_STORAGE_BUCKET: "demo-orider-coach-local.appspot.com",VITE_FIREBASE_APP_ID: "1:123:web:local",VITE_AUTH_EMULATOR_PORT: "19199",VITE_FIRESTORE_EMULATOR_PORT: "18180",VITE_FUNCTIONS_EMULATOR_PORT: "15001",VITE_STORAGE_EMULATOR_PORT: "19198" }
  },
});
