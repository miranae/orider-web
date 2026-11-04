# Discord login UI review

- Route: `/ko`, logged-out public landing, open `시작하기` login dialog.
- Viewport: 390 × 844, Korean, light mode.
- Evidence: `mobile-login.png` captured from local Vite with Playwright; no production writes.
- The Discord button uses the existing social OAuth callback. Settings > Account lists
  Discord using the same provider list and link/unlink controls as existing providers.
- Actual Discord consent, account identity and host WebView behavior require the OAuth
  application's redirect registration, backend secrets and server rollout first.
