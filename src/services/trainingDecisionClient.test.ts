import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getIdToken: vi.fn(), getAppCheckToken: vi.fn() }));
vi.mock("./firebase", () => ({ auth: { currentUser: { getIdToken: mocks.getIdToken } },
  getAppCheckToken: mocks.getAppCheckToken }));
vi.mock("./runtimeConfig", () => ({ getRuntimeConfig: () => ({ aiApiBase: "https://coach.example.run.app" }) }));

import { getTodayTrainingDecision } from "./trainingDecisionClient";
import { trainingDecisionEnvelope } from "./trainingDecisionContract.test";

describe("trainingDecisionClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getIdToken.mockResolvedValue("id-token");
    mocks.getAppCheckToken.mockResolvedValue("app-check");
  });
  afterEach(() => vi.useRealTimers());

  it("preserves HTTP status and JSON parsing context", async () => {
    const parseError = new SyntaxError("invalid JSON");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 502,
      json: async () => { throw parseError; } } as Response);
    await expect(getTodayTrainingDecision("bike")).rejects.toMatchObject({
      kind: "http", code: "INVALID_JSON_HTTP_502", cause: parseError,
    });
  });

  it("rejects a valid response for a different requested discipline", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(trainingDecisionEnvelope({
      discipline: "run", targetDiscipline: "run",
    }))));
    await expect(getTodayTrainingDecision("bike")).rejects.toMatchObject({
      kind: "contract", code: "INVALID_TRAINING_DECISION",
    });
  });

  it("times out a stalled decision request so callers can render the fallback", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    const rejection = expect(getTodayTrainingDecision("bike"))
      .rejects.toMatchObject({ kind: "transport", code: "REQUEST_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
  });
});
