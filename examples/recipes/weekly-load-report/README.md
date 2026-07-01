# Weekly Load Report Example

This example uses a rider-created Orider Personal Data API key to create:

- `weekly-load-report.html`
- `weekly-load-summary.json`
- `weekly-load-public-summary.txt`

Run:

```bash
ORIDER_API_KEY=orid_xxx \
ORIDER_API_BASE=https://orider.co.kr/api/v1 \
node examples/recipes/weekly-load-report/weekly-load-report.mjs
```

Optional private route thumbnails:

```bash
ORIDER_INCLUDE_PRIVATE_MAPS=true \
ORIDER_API_KEY=orid_xxx \
node examples/recipes/weekly-load-report/weekly-load-report.mjs
```

`ORIDER_INCLUDE_PRIVATE_MAPS=true` requires `streams:read` and calls the route thumbnail endpoint documented in Swagger/OpenAPI to embed normalized route thumbnails into the local private HTML report. Do not publish that HTML without removing private route visuals.

API contract:

- Swagger UI: `/api/v1/docs`
- OpenAPI YAML: `/api/v1/docs/openapi.yaml`
