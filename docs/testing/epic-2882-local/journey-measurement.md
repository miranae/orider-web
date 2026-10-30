# Journey latency and outcome measurement

The existing Firebase Analytics wrapper is reused. Emulator mode never transmits Analytics events. The same fixed fields are emitted as browser PerformanceMeasure details for local observers; a maximum of 50 historical entries per event name is retained. Subscribe with PerformanceObserver before the run to collect every attempt, including failures and cancellations.

| Event | Start | End | Surface |
|---|---|---|---|
| activity_detail_ready | Public detail component starts a load, including a supplied initial DTO | The corresponding loaded or failed state commits to React | web_public_activity / embedded_public_activity |
| social_action_result | A valid kudos/comment mutation begins | Confirmed mutation and bounded permission-checked readback finish, fail or are cancelled | web_public_activity / embedded_public_activity |
| analysis_ready | Training-period hook starts a valid authorized request | Its matching response/error commits to React | training_period_analysis |

Payload fields are strictly `surface`, `operation`, `outcome`, and monotonic `durationMs`. No activity/user/club IDs, request periods, comment text, GPS, health values, URLs, exception messages or tokens are passed. Outcomes are success, error, access_denied, readback_error and cancelled. A confirmed social write with failed reconciliation is recorded separately from a rejected write. One attempt emits once; unmount/account/selection changes preserve cancellation counts. Telemetry errors do not break the user action.

These start points do not include navigation before component mounting, image download completion, cold process startup, or all owner-analysis charts. Initial DTOs may already be cached upstream. Do not interpret these measurements as full-navigation latency or classify cold/warm from the number alone. In development React StrictMode can replay effects, generating a cancelled setup attempt; record that condition explicitly.

For each benchmark retain source SHA, browser/viewport, fixture revision, emulator topology, network shaping, prefetch/cache state, total attempts, every outcome count, and successful latency distribution. Report error/cancellation rates with the full denominator. Run at least 30 attempts per defined condition; never extrapolate local emulator results to deployed p95. Existing feed/share/club measurements and whole-app/physical-device coverage remain separate audit items.

Regression checks cover once-only payloads, telemetry failures, denied actions, failed analysis then retry, account/selection cancellation, and a retry that must not mistake the previous rendered detail for completion.
