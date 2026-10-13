import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const script = new URL("./weekly-load-report.mjs", import.meta.url);

async function runRecipe(pages) {
  const dir = await mkdtemp(join(tmpdir(), "orider-weekly-load-"));
  const previousDir = process.cwd();
  const previousFetch = global.fetch;
  const previousKey = process.env.ORIDER_API_KEY;
  const previousBase = process.env.ORIDER_API_BASE;
  const requests = [];
  try {
    process.chdir(dir);
    process.env.ORIDER_API_KEY = "test-key";
    process.env.ORIDER_API_BASE = "https://example.test/api/v1";
    global.fetch = async (url, options) => {
      const request = new URL(url);
      requests.push({ path: request.pathname, query: request.searchParams, key: options.headers["X-API-Key"] });
      if (request.pathname.endsWith("/activities")) {
        const cursor = request.searchParams.get("cursor") || "first";
        assert.ok(pages[cursor], `unexpected cursor ${cursor}`);
        return Response.json(pages[cursor]);
      }
      assert.equal(request.pathname, "/api/v1/fitness/summary");
      return Response.json({ data: { status: "available" } });
    };
    await import(`${script.href}?case=${Math.random()}`);
    return {
      summary: JSON.parse(await readFile(join(dir, "weekly-load-summary.json"), "utf8")),
      html: await readFile(join(dir, "weekly-load-report.html"), "utf8"),
      text: await readFile(join(dir, "weekly-load-public-summary.txt"), "utf8"),
      requests,
    };
  } finally {
    global.fetch = previousFetch;
    process.chdir(previousDir);
    if (previousKey === undefined) delete process.env.ORIDER_API_KEY;
    else process.env.ORIDER_API_KEY = previousKey;
    if (previousBase === undefined) delete process.env.ORIDER_API_BASE;
    else process.env.ORIDER_API_BASE = previousBase;
    await rm(dir, { recursive: true, force: true });
  }
}

const startTime = Date.now() - 60_000;
const canonical = {
  id: "canonical", userId: "owner", startTime,
  summary: { distance: 500, ridingTimeMillis: 60_000, elevationGain: 1, tss: 2 },
  effectiveFacts: { status: "canonical", metrics: {
    distanceKm: 10, movingTimeSec: 600, elevationGainM: 20, tss: 30,
  } },
};
const recorded = {
  id: "recorded", userId: "owner", startTime: startTime - 1,
  summary: { distance: 5000, ridingTimeMillis: 300_000, elevationGain: 10, tss: 20 },
  effectiveFacts: { status: "processing", metrics: null },
};

test("uses current activity DTO, canonical metrics and recorded fallback across pages", async () => {
  const result = await runRecipe({
    first: { data: [canonical], paging: { hasMore: true, nextCursor: "second" } },
    second: { data: [recorded], paging: { hasMore: false, nextCursor: null } },
  });
  assert.equal(result.summary.week.sessions, 2);
  assert.equal(result.summary.week.distanceKm, 15);
  assert.equal(result.summary.week.movingMin, 15);
  assert.equal(result.summary.week.elevationM, 30);
  assert.equal(result.summary.week.load, 50);
  assert.match(result.html, /<strong>15 km<\/strong>/);
  assert.match(result.text, /2 sessions · 15 km · 15 min · load 50/);
  assert.deepEqual(result.requests.map((request) => request.path), [
    "/api/v1/activities", "/api/v1/activities", "/api/v1/fitness/summary",
  ]);
  assert.equal(result.requests[0].query.get("limit"), "100");
  assert.ok(Number(result.requests[0].query.get("since")) > Date.now() - 15 * 86_400_000);
  assert.equal(result.requests[1].query.get("cursor"), "second");
  assert.ok(result.requests.every((request) => request.key === "test-key"));
});

test("keeps missing metrics unknown instead of reporting a false zero", async () => {
  const missing = {
    id: "missing", userId: "owner", startTime,
    summary: { distance: 1000, ridingTimeMillis: 120_000, elevationGain: 0 },
    effectiveFacts: { status: "pending", metrics: null },
  };
  const result = await runRecipe({
    first: { data: [missing], paging: { hasMore: false, nextCursor: null } },
  });
  assert.equal(result.summary.week.distanceKm, 1);
  assert.equal(result.summary.week.movingMin, 2);
  assert.equal(result.summary.week.elevationM, 0);
  assert.equal(result.summary.week.load, null);
  assert.equal(result.summary.state, "load unavailable");
  assert.match(result.html, /<strong>—<\/strong>/);
  assert.match(result.text, /1 sessions · 1 km · 2 min · load —/);
});

test("rejects mixed owners across activity pages", async () => {
  await assert.rejects(runRecipe({
    first: { data: [canonical], paging: { hasMore: true, nextCursor: "second" } },
    second: {
      data: [{ ...recorded, userId: "another-rider" }],
      paging: { hasMore: false, nextCursor: null },
    },
  }), /Activity owner mismatch/);
});

test("adds subminute moving durations before rounding the displayed total", async () => {
  const first = {
    id: "thirty-seconds-1", userId: "owner", startTime,
    summary: { distance: 100, ridingTimeMillis: 30_000, elevationGain: 0, tss: 1 },
    effectiveFacts: { status: "pending", metrics: null },
  };
  const result = await runRecipe({
    first: {
      data: [first, { ...first, id: "thirty-seconds-2", startTime: startTime - 1 }],
      paging: { hasMore: false, nextCursor: null },
    },
  });
  assert.equal(result.summary.week.movingMin, 1);
  assert.match(result.html, /1 min/);
  assert.match(result.text, /2 sessions · 0 km · 1 min · load 2/);
});
