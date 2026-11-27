# AI Coach four-axis Web evidence retirement

The cross-repository Web evidence producer and its exact workflow path were retired on 2026-07-28.
They attempted to duplicate product response contracts and infer arbitrary privacy leaks, which is not
a complete or maintainable release boundary. The backend dispatcher and consumer were removed in
`miranae/orider-g1-web#1706`; legacy cleanup access is retained only by `#1707` until old journals drain.

AI Coach promotion continues to require the authoritative product and runtime gates:

- frontend lint, unit tests, type checking, and production build;
- backend corpus and contract tests;
- candidate Stage smoke validation;
- production before/after audit; and
- App physical-device evidence where that gate applies.

Do not recreate a synthetic Web evidence artifact or make a privacy-pattern scanner a promotion
requirement. Privacy boundaries belong in response minimization, logging redaction, and the actual
runtime contracts and tests.
