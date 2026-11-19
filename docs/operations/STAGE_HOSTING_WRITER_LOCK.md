# Development Hosting writer lock

`orider-dev` publication is manual-only. Normal writes use the repository's
`deploy-hosting-stage` concurrency group with cancellation disabled.

Missing/false `ORIDER_STAGE_HOSTING_SERIALIZED_WRITES` intentionally freezes
manual publication before cloud authentication. This does not block merging the
workflow and is not a failed backward-compatible default. The operator enables
it only after the merged remote `dev` workflow is verified to have no push
trigger and a non-cancelling shared lock, and all other normal writers are audited.
The separate activation step is authorized operational setup, not part of this PR.

The assertion is an operational contract, not IAM enforcement or an atomic
Hosting write precondition. Concurrent Console/manual writes are unsupported;
stop/await active CI before any break-glass write. This PR does not publish Hosting.
