import { act, renderHook } from "@testing-library/react";
import i18n from "i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCallableImplementation } from "../__tests__/mocks/firebase";
import type { RecommendationFacts } from "../utils/todaysRecommendation";
import { useTodaysNarrative } from "./useTodaysNarrative";

const mocks = vi.hoisted(() => ({ uid: "full-user" }));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: mocks.uid } }),
}));

function makeFacts(tsb: number, discipline: "bike" | "run" = "bike"): RecommendationFacts {
  return {
    type: "endurance",
    sessionName: "Z2",
    sessionNameKey: "training:session.z2Endurance",
    tone: "lime",
    zone: 2,
    durationMin: [45, 60],
    chips: [],
    contextTags: [],
    inputSnapshot: {
      tsb,
      ctl: 40,
      atl: 35,
      recent7dTss: 200,
      discipline,
      daysUntilGoal: null,
    },
  };
}

describe("useTodaysNarrative single-flight full request", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    mocks.uid = "full-user";
    await i18n.changeLanguage("ko");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the first full request and ignores changed inputs until A completes", async () => {
    const resolvers = new Map<number, (value: unknown) => void>();
    let callableCount = 0;
    setCallableImplementation("getTodaysRecommendationNarrative", (request) => {
      callableCount++;
      const tsb = (request as { facts: RecommendationFacts }).facts.inputSnapshot.tsb;
      return new Promise((resolve) => { resolvers.set(tsb, resolve); });
    });

    const { result, rerender } = renderHook(
      ({ facts }) => useTodaysNarrative(facts, true),
      { initialProps: { facts: makeFacts(1, "bike") } },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(resolvers.has(1)).toBe(true);
    expect(callableCount).toBe(1);

    mocks.uid = "full-user-b";
    await i18n.changeLanguage("en");
    rerender({ facts: makeFacts(2, "run") });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_600); });
    expect(callableCount).toBe(1);
    expect(resolvers.has(2)).toBe(false);

    await act(async () => {
      resolvers.get(1)!({ data: { narrative: "first A", source: "generated", generatedAt: 1 } });
      await Promise.resolve();
    });
    expect(result.current.narrative).toBe("first A");
    expect(result.current.cacheContext).toEqual({
      uid: "full-user",
      discipline: "bike",
      lang: "ko",
    });
    expect(callableCount).toBe(1);
  });

  it("stops after failure and succeeds only after an explicit retry", async () => {
    let calls = 0;
    setCallableImplementation("getTodaysRecommendationNarrative", () => {
      calls++;
      return Promise.reject({ code: "functions/internal" });
    });

    const { result } = renderHook(() => useTodaysNarrative(makeFacts(3), true));
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.errorKind).toBe("request");
    expect(calls).toBe(1);

    setCallableImplementation("getTodaysRecommendationNarrative", () => {
      calls++;
      return { data: { narrative: "retry success", source: "generated", generatedAt: 2 } };
    });
    act(() => result.current.retry());
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    await act(async () => { await Promise.resolve(); });

    expect(result.current.narrative).toBe("retry success");
    expect(result.current.errorKind).toBeNull();
    expect(calls).toBe(2);
  });
});
