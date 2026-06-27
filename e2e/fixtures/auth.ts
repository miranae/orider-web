import type { Page } from '@playwright/test';

const AUTH_EMULATOR = 'http://localhost:9099';
const API_KEY = 'fake-api-key';

interface SignUpResponse {
  localId: string;
  idToken: string;
  refreshToken: string;
}

/** Create a user in the Auth Emulator via REST. */
export async function createTestUser(
  email: string,
  password: string,
  displayName: string,
): Promise<SignUpResponse> {
  const resp = await fetch(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName, returnSecureToken: true }),
    },
  );
  if (!resp.ok) throw new Error(`createTestUser failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

/** Sign in an existing user and return idToken. */
export async function signInUser(email: string, password: string): Promise<SignUpResponse> {
  const resp = await fetch(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  if (!resp.ok) throw new Error(`signInUser failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

/**
 * Log in a user via the Auth Emulator and inject the auth state into the page.
 * Must be called after page.goto() so the Firebase SDK is loaded.
 */
export async function loginAs(page: Page, email: string, password: string) {
  const { idToken } = await signInUser(email, password);

  await page.evaluate(async (token) => {
    const { getAuth, signInWithCredential, GoogleAuthProvider } = await import('firebase/auth');
    const auth = getAuth();
    // Use a custom token approach: the emulator treats any valid token as authentic
    const credential = GoogleAuthProvider.credential(token);
    await signInWithCredential(auth, credential);
  }, idToken);

  // Wait for auth state to propagate to UI
  await page.waitForTimeout(500);
}

/** Clear all Auth Emulator accounts. */
export async function clearAuthEmulator() {
  await fetch(
    `${AUTH_EMULATOR}/emulator/v1/projects/orider-g1/accounts`,
    { method: 'DELETE' },
  );
}
