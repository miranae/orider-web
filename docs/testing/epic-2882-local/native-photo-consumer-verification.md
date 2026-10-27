# Native photo consumer verification (local)

The UI consumes native activity/photo references through the authorized bytes callable and Blob URLs, not persistent Storage download tokens. Provider photo URLs retain their separate existing path. This is local implementation evidence, not deployed migration proof.

Focused regressions cover server-upload success/failure/account change, profile-cover identity deduplication, retryable full-view failures, clearing prior-account images, legacy native URL rejection, owner overview projection/upload deduplication with deletion controls, and native map marker/popup reference propagation with removal of a selected photo.

## Known cost: independent consumers

The profile cover and photo strip may mount the same photo concurrently. Each visible consumer has its own hook and in-memory Blob lifecycle, so these consumers may issue separate authorized bytes requests. Opening the full viewer also performs a fresh read. No shared request cache was introduced in this transition; this preserves simple per-consumer revocation and account boundaries but may duplicate bandwidth/read costs.

IntersectionObserver should continuously disable offscreen consumers; tab backgrounding clears bytes and foregrounding rechecks access for currently enabled consumers. These guards do not deduplicate simultaneously visible consumers. Measure callable count, transferred bytes and memory for cover+strip, long feeds and foreground return before rollout. If in-flight deduplication is later added, it must be scoped to auth identity, Firebase app/project and photo reference, invalidate on revocation/background/account changes, and never persist bearer URLs or image bytes.

Tests use mocked map tiles and byte services for consumer behavior; they do not prove a deployed ACL/Storage migration or real-map rendering. Actual local HTTP security checks and migration evidence remain separate release gates.
