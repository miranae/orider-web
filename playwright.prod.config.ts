import { defineConfig, devices } from '@playwright/test';

// 운영(orider.co.kr) 배포 후 스모크 전용 — 로컬 dev 서버·에뮬레이터 없이 라이브만 본다.
// 실행: npx playwright test --config playwright.prod.config.ts
export default defineConfig({
  testDir: './e2e/prod-smoke',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  reporter: [['list']],
  timeout: 45000,

  use: {
    baseURL: process.env.PROD_SMOKE_BASE_URL ?? 'https://orider.co.kr',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
});
