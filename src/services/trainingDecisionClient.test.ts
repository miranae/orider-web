import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentUid: "owner" as string | null, getIdToken: vi.fn(), getAppCheckToken: vi.fn() }));
vi.mock("./firebase", () => ({ auth: { get currentUser() { return mocks.currentUid === null ? null : {
  uid: mocks.currentUid, getIdToken: mocks.getIdToken,
}; } },
  getAppCheckToken: mocks.getAppCheckToken }));
vi.mock("./runtimeConfig", () => ({ getRuntimeConfig: () => ({ aiApiBase: "https://coach.example.run.app" }) }));

import { getTodayTrainingDecision } from "./trainingDecisionClient";
import { trainingDecisionEnvelope } from "./trainingDecisionContract.test";

describe("trainingDecisionClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.currentUid = "owner";
    mocks.getIdToken.mockResolvedValue("id-token");
    mocks.getAppCheckToken.mockResolvedValue("app-check");
  });
  afterEach(() => vi.useRealTimers());

  it("preserves HTTP status and JSON parsing context", async () => {
    const parseError = new SyntaxError("invalid JSON");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 502,
      json: async () => { throw parseError; } } as Response);
    await expect(getTodayTrainingDecision("owner", "bike")).rejects.toMatchObject({
      kind: "http", code: "INVALID_JSON_HTTP_502", cause: parseError,
    });
  });

  it("rejects a valid response for a different requested discipline", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(trainingDecisionEnvelope({
      discipline: "run", targetDiscipline: "run",
    }))));
    await expect(getTodayTrainingDecision("owner", "bike")).rejects.toMatchObject({
      kind: "contract", code: "INVALID_TRAINING_DECISION",
    });
  });

  it("times out a stalled decision request so callers can render the fallback", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    const rejection = expect(getTodayTrainingDecision("owner", "bike"))
      .rejects.toMatchObject({ kind: "transport", code: "REQUEST_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
  });

  it("rejects a response when the authenticated user changes while it is in flight", async () => {
    let resolveFetch!: (response: Response) => void;
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const request = getTodayTrainingDecision("owner", "bike");
    await Promise.resolve();
    await Promise.resolve();
    mocks.currentUid = "next-owner";
    resolveFetch(new Response(JSON.stringify(trainingDecisionEnvelope())));
    await expect(request).rejects.toMatchObject({ kind: "auth", code: "AUTH_IDENTITY_CHANGED" });
  });

  it("preserves retry-after metadata for a retryable Today endpoint response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      error: { code: "TEMPORARILY_UNAVAILABLE" },
    }), { status: 503, headers: { "Retry-After": "12" } }));
    await expect(getTodayTrainingDecision("owner", "bike")).rejects.toMatchObject({
      kind: "http", code: "TEMPORARILY_UNAVAILABLE", status: 503, retryAfterMs: 12_000,
    });
  });

  it("preserves retryable status when a 503 response body is invalid JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not-json", {
      status: 503, headers: { "Retry-After": "7" },
    }));
    await expect(getTodayTrainingDecision("owner", "bike")).rejects.toMatchObject({
      kind: "http", code: "INVALID_JSON_HTTP_503", status: 503, retryAfterMs: 7_000,
    });
  });
});
