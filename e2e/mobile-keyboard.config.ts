import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: './tests', testMatch: 'mobile-keyboard.spec.ts', workers: 1,
  use: { baseURL: 'http://127.0.0.1:18498', viewport: { width: 390, height: 844 }, hasTouch: true },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', isMobile: true } }, { name: 'webkit', use: { browserName: 'webkit', isMobile: true } }],
  webServer: { cwd: fileURLToPath(new URL('..', import.meta.url)), command: 'node_modules/.bin/vite --config e2e/mobile-keyboard.vite.config.ts --host 127.0.0.1 --port 18498', url: 'http://127.0.0.1:18498', reuseExistingServer: false },
});
