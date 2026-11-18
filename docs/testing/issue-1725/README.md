# #1725 public cumulative totals

Synthetic local Firestore fixture, three private activities: 3 activities, 36 km, 3 h, 450 m. Profile details are private. Screenshots use the real AthletePage and the actual AthleteProfileSurface for the embedded screenshot. The public API adapter invokes the real server aggregate reader against the local emulator. No production identity or private records were captured.

- Desktop Chromium: 1440×1000, Korean, guest
- Mobile Chromium: 390×844, Korean, guest
- App embedded surface: 390×844, English, guest fixture (host application / physical WebView not exercised)

All three show identical four totals and whole-history wording. Private activity description remains absent. Guest/authenticated visitor rendering and pending/failed/unknown states are also covered by component/service tests. Server tests cover direct detail authorization denial and identical guest/stranger/friend/owner totals with mixed visibility. Production deployment and logged-in acceptance must be recorded separately.

Screenshots refreshed from the final read-time snapshot UI: successful callable results include their retrieval time, English visitor wording uses all activity records, and no cached Firestore document provides the metric values. Existing-account bulk backfill and ledger repair are excluded by user instruction.
