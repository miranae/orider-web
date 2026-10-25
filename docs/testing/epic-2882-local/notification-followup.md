# R3 notification destinations — local evidence

The WEB inbox now uses `getWebNotifications` and `markWebNotificationsRead` instead of reading or updating raw notification documents. Unavailable rows contain no old actor, activity, or comment content. The inbox rechecks the newest 20 on focus/visible 30-second refresh; pagination is explicit, and refresh intentionally replaces earlier pages rather than retaining unverified payloads.

Comment notifications retain `commentId` in the activity URL and resolve it through `getActivityPublicComment`, including comments outside the first page. Login preserves the URL; missing/deleted/blocked targets receive an explicit unavailable message. Exact-comment content is cleared while backgrounded, on account replacement (including the same UID), local activity safety/content changes, and failed access refresh. Remote revocation is bounded by the visible 30-second refresh and 10-second request timeout, not instantaneous. Mark-read permission/unauthenticated denial clears cached rows and invalidates pending pagination; generic receipt network failures do not block navigation.

Incomplete real accounts still enter onboarding; anonymous public-preview sessions do not.

## Verification

- Focused notification/service/route regression: 8 files / 90 tests passed before the final small changes; final Layout suites 36 passed and inbox suite 6 passed (including permission-denial late-page races).
- TypeScript and changed-file ESLint passed before final guard/race tests; root runs the final whole-source gates.
- Actual Chrome headless mobile 390×844 on app5174 / HTTP5039 / Auth9309 / Firestore8398, synthetic project `demo-orider-epic-2882-full`: 5 journey checks passed, no page errors. No response interception/mocks or service restarts.
- Verified notification → exact comment `seed21` beyond initial page; read receipt; real Auth emulator sign-out removes content and preserves destination; sign-in restores it; deleted comment clears on access refresh; blocked author renders generic unavailable notification.
- All synthetic notification/comment/block mutations restored after verification.
- Evidence: `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882/r3-notifications/results.json`, `exact-comment.png`, `deleted-comment.png`, `blocked-notification.png`, `verify.mjs`.
- First failed browser selector retained in `results-before-authoritative-message-fix.json`: it expected stored notification text, while the server correctly regenerated the current authoritative comment text. The corrected journey passed.

External OAuth, production, mobile apps and complete end-to-end coverage are not established by this local test. No remote writes or deployment occurred.

## Rollout dependency

The server rules intentionally deny raw `notifications/{uid}/items` reads/writes. WEB depends on the three new callable handlers and current rules as one coordinated rollout. Native app consumers that still read or mark raw notification documents must migrate to equivalent authenticated callable contracts before those rules can be released to them; this work does not establish app compatibility. The current work is local only and does not authorize deploying the rules independently.
