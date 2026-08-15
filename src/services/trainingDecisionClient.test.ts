import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getIdToken: vi.fn(), getAppCheckToken: vi.fn() }));
vi.mock("./firebase", () => ({ auth: { currentUser: { getIdToken: mocks.getIdToken } },
  getAppCheckToken: mocks.getAppCheckToken }));
vi.mock("./runtimeConfig", () => ({ getRuntimeConfig: () => ({ aiApiBase: "https://coach.example.run.app" }) }));

import { getTodayTrainingDecision } from "./trainingDecisionClient";

describe("trainingDecisionClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getIdToken.mockResolvedValue("id-token");
    mocks.getAppCheckToken.mockResolvedValue("app-check");
  });

  it("preserves HTTP status and JSON parsing context", async () => {
    const parseError = new SyntaxError("invalid JSON");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 502,
      json: async () => { throw parseError; } } as Response);
    await expect(getTodayTrainingDecision("bike")).rejects.toMatchObject({
      kind: "http", code: "INVALID_JSON_HTTP_502", cause: parseError,
    });
  });
});
