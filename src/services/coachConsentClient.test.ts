import { beforeEach, describe, expect, it, vi } from "vitest";

const { getIdToken, getAppCheckToken, runtime } = vi.hoisted(() => ({
  getIdToken: vi.fn(), getAppCheckToken: vi.fn(), runtime: { aiApiBase: "https://ai.example" as string | undefined },
}));
vi.mock("./firebase", () => ({
  auth: { currentUser: { getIdToken } },
  getAppCheckToken,
}));
vi.mock("./runtimeConfig", () => ({ getRuntimeConfig: () => runtime }));

import { acceptCoachConsent, getCoachConsentPolicy, revokeCoachConsent } from "./coachConsentClient";

const policy = {
  policyVersion: "ai-coach-policy-v1", title: "AI Coach", purpose: "answer",
  dataCategories: ["user_question", "training_summary", "fitness_metrics", "active_goal", "workout_plan"], retention: "no raw logs",
  privacyPolicyUrl: "/privacy", policyDocumentUrl: "/policies/ai-coach",
  processor: { name: "Anthropic", service: "Claude", privacyPolicyUrl: "https://example.com/privacy" },
  internationalProcessing: { recipient: "Anthropic", country: "US", purpose: "answer",
    dataCategories: ["user_question", "training_summary"], timingAndMethod: "API", retention: "zero retention" },
  withdrawal: { method: "Settings", apiPath: "/v1/coach/consent", effect: "immediate" },
  changeSummary: null,
  consent: { currentPolicyVersion: "ai-coach-policy-v1", storedPolicyVersion: null, current: false,
    stale: false, consented: false, revoked: false, active: false, consentedAt: null, revokedAt: null, revision: null },
};

describe("coachConsentClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getIdToken.mockResolvedValue("id-token");
    getAppCheckToken.mockResolvedValue("app-check-token");
    runtime.aiApiBase = "https://ai.example";
  });

  it("uses authoritative policy metadata with Auth and App Check", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: policy })));
    await expect(getCoachConsentPolicy()).resolves.toMatchObject(policy);
    expect(fetchMock).toHaveBeenCalledWith("https://ai.example/v1/coach/consent-policy", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer id-token", "X-Firebase-AppCheck": "app-check-token" }),
    }));
  });

  it("accepts the server version and revokes through server APIs only", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ data: policy })));
    await acceptCoachConsent("ai-coach-policy-v1");
    await revokeCoachConsent();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PUT", body: JSON.stringify({ policyVersion: "ai-coach-policy-v1" }) });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "DELETE" });
  });

  it("fails closed when authoritative policy fields are absent", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ policyVersion: "v1", consent: { status: "current" } })));
    await expect(getCoachConsentPolicy()).rejects.toThrow("INVALID_COACH_CONSENT_RESPONSE");
  });

  it("rejects a response outside the strict data envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(policy)));
    await expect(getCoachConsentPolicy()).rejects.toThrow("INVALID_COACH_CONSENT_RESPONSE");
  });

  it("derives stale UI state from backend booleans", async () => {
    const stale = { ...policy, consent: { ...policy.consent, storedPolicyVersion: "v0", stale: true, consented: true, revision: "2026-01-01" } };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: stale })));
    await expect(getCoachConsentPolicy()).resolves.toMatchObject({ consent: { state: "stale" } });
  });

  it("fails closed instead of falling back to a same-origin /api route", async () => {
    runtime.aiApiBase = undefined;
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(getCoachConsentPolicy()).rejects.toThrow("AI_API_BASE_MISSING");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
