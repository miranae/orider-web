# Overlapping native photo reads

Local product commit `9977a2b0`, 2026-10-26.

The profile renders the same native photo in its cover and photo strip. Concurrent requests previously performed separate authenticated byte reads. The photo service now shares only an **in-flight** request with the same injected Firebase services, exact Firebase User object, activity/photo identity and operation (bytes or access check). A replacement User object, even with the same UID, starts a new scope. Settlement or failure removes the entry. Upload and cover mutations are never coalesced.

This is not a persistent image or permission cache. Subsequent requests still reauthorize; consumers retain their own Blob URLs, offscreen/background cleanup and periodic access checks. Sequential requests, later remounts and reads from different service instances may still duplicate work.

Validation:

- 18 service/hook tests passed, including concurrent sharing, fresh reads after settlement/failure, separate access probes, service/photo/account boundaries and existing Blob revocation checks.
- Focused ESLint and TypeScript check passed.
- Actual full-app desktop profile smoke: six HTTP 200 byte calls displayed twelve Blob images (six cover, six strip), with no page errors. This is one local observation, not a production cost or latency claim.
- Evidence: `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882/r8-photo-reads/results.json` and `profile.png`. The synthetic profile document was absent, so the harness temporarily seeded an allowlisted public profile in the demo emulator and deleted it afterward. Earlier fixture-less observation correctly showed “user not found”; an intermediate run observed ten calls/eight images while source work was ongoing and is not used as the settled result.

A full-source regression is required after the concurrent notification/club work settles. Earlier broad checks belong to the preceding source checkpoint.
