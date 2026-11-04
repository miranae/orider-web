import { defineConfig } from '@playwright/test';
// Synthetic fixture only: no Auth/Firestore emulator or production data access.
export default defineConfig({
  testDir: './tests',
  testMatch: 'club-spectator-continuity.spec.ts',
  timeout: 60000,
  workers: 1,
  use: {baseURL: 'http://127.0.0.1:18488', launchOptions: {args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']}},
  projects: [
    {name: 'mobile', use: {viewport: {width: 390, height: 844}}},
    {name: 'tablet', use: {viewport: {width: 834, height: 1194}}},
    {name: 'desktop', use: {viewport: {width: 1440, height: 1100}}},
  ],
  webServer: {command: 'npx vite --host 127.0.0.1 --port 18488', url: 'http://127.0.0.1:18488', reuseExistingServer: !process.env.CI},
});
