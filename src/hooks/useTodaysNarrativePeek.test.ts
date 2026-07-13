import { act, renderHook, waitFor } from "@testing-library/react";
import i18n from "i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setCallableImplementation, setCallableResult } from "../__tests__/mocks/firebase";
import type { RecommendationFacts } from "../utils/todaysRecommendation";
import {
  invalidateTodaysNarrativePeekCache,
  publishTodaysNarrativePeekCache,
  useTodaysNarrativePeek,
} from "./useTodaysNarrativePeek";

const mocks = vi.hoisted(() => ({ uid: "peek-user" }));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: mocks.uid } }),
}));

const facts = {
  type: "endurance",
  sessionName: "Z2",
  sessionNameKey: "training:session.z2Endurance",
  tone: "lime",
  zone: 2,
  durationMin: [45, 60],
  chips: [],
  contextTags: [],
  inputSnapshot: {
    tsb: 5,
    ctl: 40,
    atl: 35,
    recent7dTss: 200,
    discipline: "bike",
    daysUntilGoal: null,
  },
} as RecommendationFacts;

describe("useTodaysNarrativePeek session publication", () => {
  beforeEach(async () => {
    mocks.uid = "peek-user";
    invalidateTodaysNarrativePeekCache(mocks.uid, "bike");
    invalidateTodaysNarrativePeekCache(mocks.uid, "run");
    await i18n.changeLanguage("ko");
  });

  it("keeps a published reanalysis when an older cacheOnly request resolves later", async () => {
    let resolveOld!: (value: unknown) => void;
    setCallableImplementation(
      "getTodaysRecommendationNarrative",
      () => new Promise((resolve) => { resolveOld = resolve; }),
    );

    const { result } = renderHook(() => useTodaysNarrativePeek("bike", true, facts));
    await waitFor(() => expect(result.current.loading).toBe(true));

    act(() => {
      publishTodaysNarrativePeekCache(mocks.uid, "bike", "ko", "새 AI 분석");
    });
    expect(result.current).toEqual({
      narrative: "새 AI 분석",
      loading: false,
      cacheMiss: false,
      stale: false,
    });

    await act(async () => {
      resolveOld({ data: { hit: true, narrative: "예전 AI 분석", stale: true } });
    });
    expect(result.current.narrative).toBe("새 AI 분석");
    expect(result.current.stale).toBe(false);

    const second = renderHook(() => useTodaysNarrativePeek("bike", true, facts));
    expect(second.result.current.narrative).toBe("새 AI 분석");
  });

  it("isolates published narratives by language and discipline", async () => {
    publishTodaysNarrativePeekCache(mocks.uid, "bike", "ko", "한국어 사이클");
    publishTodaysNarrativePeekCache(mocks.uid, "bike", "en", "English bike");
    publishTodaysNarrativePeekCache(mocks.uid, "run", "ko", "한국어 러닝");

    const bike = renderHook(() => useTodaysNarrativePeek("bike", true, facts));
    await waitFor(() => expect(bike.result.current.narrative).toBe("한국어 사이클"));

    const run = renderHook(() => useTodaysNarrativePeek("run", true, facts));
    await waitFor(() => expect(run.result.current.narrative).toBe("한국어 러닝"));

    await act(async () => { await i18n.changeLanguage("en"); });
    bike.rerender();
    await waitFor(() => expect(bike.result.current.narrative).toBe("English bike"));
  });

  it("preserves explicit invalidation for both language slots", async () => {
    publishTodaysNarrativePeekCache(mocks.uid, "bike", "ko", "지울 한국어");
    publishTodaysNarrativePeekCache(mocks.uid, "bike", "en", "clear English");
    invalidateTodaysNarrativePeekCache(mocks.uid, "bike");
    setCallableResult("getTodaysRecommendationNarrative", {
      data: { hit: false },
    });

    const ko = renderHook(() => useTodaysNarrativePeek("bike", true, facts));
    await waitFor(() => expect(ko.result.current.cacheMiss).toBe(true));
    expect(ko.result.current.narrative).toBeNull();

    await act(async () => { await i18n.changeLanguage("en"); });
    const en = renderHook(() => useTodaysNarrativePeek("bike", true, facts));
    await waitFor(() => expect(en.result.current.cacheMiss).toBe(true));
    expect(en.result.current.narrative).toBeNull();
  });
});
