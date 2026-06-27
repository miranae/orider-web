import { test as base, type Page } from '@playwright/test';

export { expect } from '@playwright/test';

export const TEST_EMAIL = 'test@example.com';
export const TEST_PASSWORD = 'password123';

export const test = base.extend<{
  seededPage: Page;
  authenticatedPage: Page;
}>({
  /** Page with Firestore test data already seeded (via globalSetup). */
  seededPage: async ({ page }, use) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await use(page);
  },

  /** Page with seeded data AND a logged-in user. */
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for Firebase to initialize and expose __e2eSignIn
    await page.waitForFunction(() => typeof (window as any).__e2eSignIn === 'function', {
      timeout: 20000,
    });

    // Sign in using the exposed Firebase Auth helper
    await page.evaluate(async ({ email, password }) => {
      await (window as any).__e2eSignIn(email, password);
    }, { email: TEST_EMAIL, password: TEST_PASSWORD });

    // Wait for auth state to propagate to React context
    await page.waitForTimeout(2000);

    await use(page);
  },
});
