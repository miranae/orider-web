# Bundled Functions transport

The same callable paths run in development and production. `bundled-development`
and `bundled-production` select reviewed gateway and AI origins while preserving
production Firebase Auth/data identity and feature flags. They do not enable the
isolated analysis-only QA features.

The ordinary and embedded Web clients keep Firebase SDK authentication, App Check,
serialization and timeouts. Auth and handoff use the selected gateway; handoff
redemption still uses its separate FirebaseApp without Auth/App Check. No failed
bundled request retries against a legacy named Function.

Prepare public configuration without publishing:

```sh
node scripts/prepare-bundled-client-config.mjs \
  --source /tmp/production-runtime.json \
  --environment development \
  --output /tmp/bundled-development-config
```

Repeat with `production` for the production overlay. The output is configuration,
not a standalone Hosting release: it does not contain the built assets. Keep the
same JS/CSS artifact, pair it with the generated runtime and Hosting configuration,
and retain the release attestation/artifact checks in the deployment pipeline.
The generated Hosting rewrites replace the former Function targets with the
default gateway and preserve original paths, including REST, Strava ingress and
SEO endpoints.

The existing runtime writer accepts `BUNDLED_RUNTIME_CONFIG_PATH` and
`BUNDLED_FUNCTIONS_ENVIRONMENT`. These must not be combined with the former
production-data/parity source variables. Normal deployment remains unchanged
until this explicit configuration is selected. Deploy the backend and verify
its source/topology/digests before activating either profile.
