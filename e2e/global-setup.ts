import { chromium } from '@playwright/test';
import { seedTestData, clearEmulatorData } from './fixtures/seed';
import { createTestUser, clearAuthEmulator } from './fixtures/auth';

const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'password123';
const TEST_DISPLAY_NAME = '테스트라이더';

async function globalSetup() {
  // Clear any stale data
  await clearEmulatorData();
  await clearAuthEmulator();

  // Create auth user first so we can use its UID for seeding
  const { localId: authUid } = await createTestUser(TEST_EMAIL, TEST_PASSWORD, TEST_DISPLAY_NAME);

  // Seed Firestore using the auth UID so profile/activities match the logged-in user
  await seedTestData(authUid);

  // Warm up the Vite dev server with a real browser to trigger module compilation
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Wait for Firebase to fully initialize (sets __e2eSignIn on window)
    await page.waitForFunction(() => typeof (window as any).__e2eSignIn === 'function', {
      timeout: 20000,
    });
  } catch {
    // If warmup fails, tests will still run (just slower)
  }
  await browser.close();
}

export default globalSetup;
