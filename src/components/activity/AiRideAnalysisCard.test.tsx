import { FirebaseServicesProvider, type FirebaseServices } from "../../contexts/FirebaseServicesContext";
import * as runtimeConfig from "../../services/runtimeConfig";
import i18n from "i18next";
import enActivity from "../../i18n/resources/en/activity.json";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders as renderProviders } from "../../__tests__/utils/renderWithProviders";
import AiRideAnalysisCard from "./AiRideAnalysisCard";
import type { ActivityNarrative, NarrativeSegment } from "../../hooks/useActivityNarrative";

const renderWithProviders: typeof renderProviders = (ui, options) => renderProviders(ui, { authenticated: true, ...options });

const narrativeApiMocks = vi.hoisted(() => ({
  history: vi.fn(),
  generate: vi.fn(),
  peek: vi.fn(),
  appCheckThrottleRetryAfterMs: vi.fn(),
  claimActivityNarrativeAppCheckThrottleRecovery: vi.fn(),
}));

vi.mock("../../services/activityNarrativeApi", () => ({
  generateActivityNarrative: narrativeApiMocks.generate,
  peekActivityNarrative: narrativeApiMocks.peek,
  appCheckThrottleRetryAfterMs: narrativeApiMocks.appCheckThrottleRetryAfterMs,
  claimActivityNarrativeAppCheckThrottleRecovery: narrativeApiMocks.claimActivityNarrativeAppCheckThrottleRecovery,
}));

vi.mock("../../services/activityNarrativeHistory", () => ({ loadActivityNarrativeHistory: narrativeApiMocks.history }));

function segment(fromKm: number, toKm: number, narrative: string): NarrativeSegment {
  return {
    fromKm,
    toKm,
    terrain: "flat",
    avgGradePct: 0,
    elevGainM: 0,
    avgSpeedKmh: 25,
    avgPowerW: 120,
    avgHr: 130,
    zone: "Z2",
    pctHrMax: null,
    hrDrift: 0,
    avgCadence: 80,
    avgTempC: 22,
    relWind: "cross",
    movingSec: 600,
    pauseSec: 0,
    boundaryDriver: "distance",
    flags: [],
    efforts: [],
    narrative,
  };
}

function narrative(segments: NarrativeSegment[]): ActivityNarrative & { hit: true } {
  return {
    hit: true,
    narrativeVersion: "test",
    generatedAt: 1,
    isVirtualPower: false,
    summary: "전체 코칭 요약",
    overall: {
      totalDistanceKm: 30,
      movingSec: 1800,
      pauseSec: 0,
      elevGainM: 0,
      tempStartC: 22,
      tempEndC: 22,
      tempSource: "device",
      flags: [],
    },
    segments,
    source: "cache",
  };
}

describe("AiRideAnalysisCard", () => {
  it("uses a fixed SVG for the AI heading without requesting generation", async () => {
    narrativeApiMocks.peek.mockResolvedValue(null);
    const { container } = renderWithProviders(<AiRideAnalysisCard isActivityOwner activityId="svg-header" enabled summaryPreview="Saved summary" />, { authenticated: true });
    const heading = await screen.findByText("AI 라이딩 분석");
    expect(heading.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
    expect(container).not.toHaveTextContent("🤖");
    expect(narrativeApiMocks.generate).not.toHaveBeenCalled();
  });

  it("stage hides unsupported AI analysis and makes no peek or generation requests", async () => {
    const runtime = vi.spyOn(runtimeConfig, "getRuntimeConfig").mockReturnValue({ ...runtimeConfig.getRuntimeConfig(), appEnvironment: "stage" });
    try {
      const { container } = renderWithProviders(<AiRideAnalysisCard isActivityOwner activityId="stage-ai-hidden" enabled summaryPreview="Saved AI preview" />, { authenticated: true });
      await act(async () => { await Promise.resolve(); });
      expect(container).toBeEmptyDOMElement();
      expect(narrativeApiMocks.peek).not.toHaveBeenCalled();
      expect(narrativeApiMocks.generate).not.toHaveBeenCalled();
    } finally { runtime.mockRestore(); }
  });

  it("offers explicit reanalysis for a normal old result with a valid share summary and preserves it on input failure", async () => {
    const saved = { ...narrative([segment(0, 10, "정상 이전 코칭")]), narrativeVersion: "old-v1", generatedAt: 123000, stale: false,
      shareSummary: "기존 저장된 공유 문구" };
    narrativeApiMocks.peek.mockResolvedValue(saved);
    narrativeApiMocks.generate.mockRejectedValueOnce(Object.assign(Error("input not ready"), { code: "failed-precondition", details: { reason: "narrative_streams_not_ready" } }));
    const { container } = renderWithProviders(<AiRideAnalysisCard isActivityOwner activityId="normal-old-explicit-refresh" enabled />);
    const button = await screen.findByRole("button", { name: "다시 분석", exact: true });
    expect(narrativeApiMocks.generate).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(narrativeApiMocks.generate).toHaveBeenCalledExactlyOnceWith({ activityId: "normal-old-explicit-refresh", lang: "ko", forceRefresh: true }, expect.objectContaining({ auth: expect.anything() })));
    expect(await screen.findByRole("alert")).toHaveTextContent("저장된 분석은 유지됩니다");
    expect(screen.getByText("정상 이전 코칭")).toBeInTheDocument();
    expect(container.querySelector("time")).toHaveAttribute("datetime", new Date(123000).toISOString());
    narrativeApiMocks.history.mockResolvedValueOnce({ items: [{ revisionId: "a".repeat(64), generatedAt: 1000, version: "older-v0" }], nextCursor: null, selected: null })
      .mockResolvedValueOnce({ items: [], nextCursor: null, selected: { revisionId: "a".repeat(64), narrative: { ...saved, summary: "선택한 과거 결과", generatedAt: 1000 } } });
    fireEvent.click(screen.getByRole("button", { name: "이전 AI 분석 보기" }));
    fireEvent.click(await screen.findByRole("button", { name: /older-v0/ }));
    expect(await screen.findByText("선택한 과거 결과")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 분석", exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 시도", exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "현재 분석으로 돌아가기" })).toBeInTheDocument();
  });

  it("keeps a legacy saved analysis and its timestamp visible through refresh failure and retry", async () => {
    const generatedAt = Date.UTC(2026, 8, 30, 4, 25);
    const saved = { ...narrative([segment(0, 10, "생성 당시 구간 코칭")]), narrativeVersion: "rsn-v9", generatedAt, stale: true };
    narrativeApiMocks.peek.mockResolvedValue(saved);
    let rejectRefresh!: (error: Error) => void;
    narrativeApiMocks.generate.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRefresh = reject; }))
      .mockResolvedValueOnce({ ...saved, generatedAt: generatedAt + 60_000, stale: false, summary: "최신 코칭 요약" });
    const { container } = renderWithProviders(<AiRideAnalysisCard isActivityOwner activityId="legacy-stale-refresh" enabled />, { authenticated: true });
    expect(await screen.findByText("생성 당시 구간 코칭")).toBeInTheDocument();
    const time = container.querySelector("time")!;
    expect(time).toHaveAttribute("datetime", new Date(generatedAt).toISOString());
    expect(time).toHaveTextContent(new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(generatedAt));
    expect(narrativeApiMocks.generate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "변경사항 반영해 다시 분석" }));
    expect(await screen.findByRole("status")).toHaveTextContent("저장된 분석을 계속 표시합니다");
    expect(screen.getByText("전체 코칭 요약")).toBeInTheDocument();
    expect(screen.getByText("생성 당시 구간 코칭")).toBeInTheDocument();
    await waitFor(() => expect(narrativeApiMocks.generate).toHaveBeenCalledWith({ activityId: "legacy-stale-refresh", lang: "ko", forceRefresh: true }, expect.objectContaining({ auth: expect.anything(), functions: expect.anything() })));
    await act(async () => rejectRefresh(new Error("temporary refresh failure")));
    expect(await screen.findByRole("alert")).toHaveTextContent("저장된 분석은 유지됩니다");
    expect(screen.getByText("전체 코칭 요약")).toBeInTheDocument();
    expect(container.querySelector("time")).toHaveAttribute("datetime", new Date(generatedAt).toISOString());
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("최신 코칭 요약")).toBeInTheDocument();
    expect(container.querySelector("time")).toHaveAttribute("datetime", new Date(generatedAt + 60_000).toISOString());
  });

  it("does not carry an explicit refresh request into another activity or language", async () => {
    narrativeApiMocks.peek.mockResolvedValue({ ...narrative([segment(0, 10, "기존 코칭")]), stale: true });
    narrativeApiMocks.generate.mockResolvedValue({ ...narrative([segment(0, 10, "다시 분석한 코칭")]), stale: false });
    const { rerender } = renderWithProviders(<AiRideAnalysisCard isActivityOwner activityId="scope-refresh-a" enabled />, { authenticated: true });
    expect(await screen.findByText("기존 코칭")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "변경사항 반영해 다시 분석" }));
    expect(await screen.findByText("다시 분석한 코칭")).toBeInTheDocument();
    rerender(<AiRideAnalysisCard isActivityOwner activityId="scope-refresh-b" enabled />);
    expect(await screen.findByText("기존 코칭")).toBeInTheDocument();
    expect(narrativeApiMocks.generate).toHaveBeenCalledTimes(1);
    await act(async () => { await i18n.changeLanguage("en"); });
    try {
      await waitFor(() => expect(narrativeApiMocks.peek).toHaveBeenCalledWith({ activityId: "scope-refresh-b", cacheOnly: true, lang: "en" }, expect.objectContaining({ auth: expect.anything() })));
      expect(narrativeApiMocks.generate).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => { await i18n.changeLanguage("ko"); });
    }
  });

  it("shows the saved generation date and historical-data wording in English", async () => {
    i18n.addResourceBundle("en", "activity", enActivity);
    await act(async () => { await i18n.changeLanguage("en"); });
    try {
      const generatedAt = Date.UTC(2026, 8, 30, 4, 25);
      narrativeApiMocks.peek.mockResolvedValue({ ...narrative([segment(0, 10, "Saved English coaching")]), generatedAt, stale: true });
      const { container } = renderWithProviders(<AiRideAnalysisCard activityId="english-saved-generation-date" enabled isActivityOwner />, { authenticated: true });
      expect(await screen.findByText("Saved English coaching")).toBeInTheDocument();
      expect(screen.queryByText("Activity data has changed")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reanalyze with latest data" })).toBeInTheDocument();
      expect(container).toHaveTextContent("· analyst test");
      expect(container.querySelector("time")).toHaveTextContent(new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(generatedAt));
      expect(narrativeApiMocks.generate).not.toHaveBeenCalled();
    } finally {
      await act(async () => { await i18n.changeLanguage("ko"); });
    }
  });

  it("does not invent a timestamp for a saved analysis without a valid generation date", async () => {
    narrativeApiMocks.peek.mockResolvedValue({ ...narrative([segment(0, 10, "시각 없는 코칭")]), generatedAt: NaN });
    const { container } = renderWithProviders(<AiRideAnalysisCard isActivityOwner activityId="invalid-generation-date" enabled />);
    expect(await screen.findByText("시각 없는 코칭")).toBeInTheDocument();
    expect(container.querySelector("time")).toBeNull();
  });

  it("shows full AI analysis, segment coaching and prescriptions without rendering a cached share summary", async () => {
    narrativeApiMocks.peek.mockResolvedValue({
      ...narrative([segment(0, 10, "구간별 코칭 유지")]),
      socialSummary: {
        narrative: "공유할 성취 요약", achievements: [], shareText: "공유할 성취 요약",
        fitnessImpact: {
          status: "available", discipline: "bike", asOf: 1, timezone: "UTC",
          before: { ctl: 51.9, atl: 65.2, tsb: -13.3 }, after: { ctl: 53.3, atl: 71.6, tsb: -18.3 },
          delta: { ctl: 1.4, atl: 6.4, tsb: -5 },
        },
      },
      prescriptions: [{ horizon: "ride", theme: "recovery", title: "회복 권고", detail: "다음 주행은 가볍게" }],
    });
    renderWithProviders(<AiRideAnalysisCard activityId="coaching-with-social-summary" enabled isActivityOwner />, { authenticated: true });
    expect(await screen.findByText("전체 코칭 요약")).toBeInTheDocument();
    expect(screen.getByText("다음 주행은 가볍게")).toBeInTheDocument();
    expect(screen.getByText("구간별 코칭 유지")).toBeInTheDocument();
    expect(screen.queryByText("공유할 성취 요약")).not.toBeInTheDocument();
    expect(screen.queryByText("51.9 → 53.3 (+1.4)")).not.toBeInTheDocument();
  });

  beforeEach(() => {
    window.sessionStorage.clear();
    narrativeApiMocks.generate.mockReset();
    narrativeApiMocks.peek.mockReset().mockResolvedValue({ hit: false });
    narrativeApiMocks.claimActivityNarrativeAppCheckThrottleRecovery.mockReset().mockReturnValue(false);
    narrativeApiMocks.appCheckThrottleRetryAfterMs.mockReset().mockImplementation((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      const retryAfter = message.match(/after (\d+)h:(\d+)m:(\d+)s/i);
      return retryAfter
        ? (Number(retryAfter[1]) * 60 * 60 + Number(retryAfter[2]) * 60 + Number(retryAfter[3])) * 1_000
        : null;
    });
  });

  it("keeps explicit reanalysis without restoring the removed share-text feature", async () => {
    narrativeApiMocks.peek.mockResolvedValue({ ...narrative([segment(0, 10, "구간 코칭")]), shareSummary: null });
    renderWithProviders(<AiRideAnalysisCard activityId="invalid-short-share" enabled isActivityOwner />, { authenticated: true });
    expect(await screen.findByText("구간 코칭")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 분석" })).toBeInTheDocument();
    expect(narrativeApiMocks.generate).not.toHaveBeenCalled();
  });

  it("shows saved AI summary instead of a fresh analysis CTA when detail cache misses", async () => {
    renderWithProviders(
      <AiRideAnalysisCard isActivityOwner
        activityId="strava_19098693942"
        enabled
        summaryPreview="전반적으로 안정적인 페이스의 라이딩이었습니다."
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("전반적으로 안정적인 페이스의 라이딩이었습니다.")).toBeInTheDocument();
    });
    expect(screen.queryByText("분석시작")).not.toBeInTheDocument();
    expect(screen.getByText(/생성 당시의 분석/)).toBeInTheDocument();
  });

  it("keeps the saved AI summary and hides raw auth errors when detail reload is unauthenticated", async () => {
    narrativeApiMocks.generate.mockRejectedValue(new Error("Unauthenticated"));

    renderWithProviders(
      <AiRideAnalysisCard isActivityOwner
        activityId="strava_19098693941"
        enabled
        summaryPreview="저장된 요약은 계속 보여야 합니다."
      />,
      { authenticated: true },
    );

    await waitFor(() => {
      expect(screen.getByText("저장된 요약은 계속 보여야 합니다.")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "상세 분석 다시 불러오기" }));

    await waitFor(() => {
      expect(screen.getByText("저장된 요약은 계속 보여야 합니다.")).toBeInTheDocument();
      expect(screen.getByText(/로그인해 주세요/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/분석 실패/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Unauthenticated/)).not.toBeInTheDocument();
  });

  it("shows a neutral restart action instead of raw App Check errors after one recovery reload", async () => {
    narrativeApiMocks.generate.mockRejectedValue(new Error(
      "AppCheck: Requests throttled due to previous 403 error. Attempts allowed again after 20h:58m:47s (appCheck/throttled).",
    ));

    renderWithProviders(
      <AiRideAnalysisCard isActivityOwner activityId="app-check-throttle" enabled />,
      { authenticated: true },
    );

    fireEvent.click(await screen.findByRole("button", { name: "분석시작" }));

    await waitFor(() => {
      expect(screen.getByText(/분석 서비스를 다시 연결/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "다시 시작" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
    expect(screen.queryByText(/AppCheck/)).not.toBeInTheDocument();
  });

  it("shows only segments with a non-empty narrative while keeping the full timeline", async () => {
    narrativeApiMocks.peek.mockResolvedValue(narrative([
      segment(0, 10, "첫 구간 코칭"),
      segment(10, 20, ""),
      segment(20, 30, " "),
    ]));

    renderWithProviders(
      <AiRideAnalysisCard isActivityOwner activityId="focused-segments-visible" enabled />,
    );

    expect(await screen.findByText("구간별 분석 (2)")).toBeInTheDocument();
    expect(screen.getByText("첫 구간 코칭")).toBeInTheDocument();
    expect(screen.queryByText("➡️ 10–20km")).not.toBeInTheDocument();
    expect(screen.getByTitle(/0–10km/)).toBeInTheDocument();
    expect(screen.getByTitle(/10–20km/)).toBeInTheDocument();
    expect(screen.getByTitle(/20–30km/)).toBeInTheDocument();
  });

  it("hides the segment coaching controls when every narrative is exactly empty", async () => {
    narrativeApiMocks.peek.mockResolvedValue(narrative([
      segment(0, 15, ""),
      segment(15, 30, ""),
    ]));

    renderWithProviders(
      <AiRideAnalysisCard isActivityOwner activityId="focused-segments-empty" enabled />,
    );

    await screen.findByText("전체 코칭 요약");
    expect(screen.queryByText(/구간별 분석/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "접기" })).not.toBeInTheDocument();
    expect(screen.getByTitle(/0–15km/)).toBeInTheDocument();
    expect(screen.getByTitle(/15–30km/)).toBeInTheDocument();
  });
  it.each([true, false])("reads ACL-authorized stored AI for a viewer without generation controls (signed in: %s)", async authenticated => {
    const saved = narrative([segment(0, 10, "허용된 활동 분석")]);
    narrativeApiMocks.peek.mockResolvedValue(saved);
    narrativeApiMocks.history.mockResolvedValueOnce({items:[{revisionId:"d".repeat(64),generatedAt:2,version:"viewer-old"}],nextCursor:null,selected:null})
      .mockResolvedValueOnce({items:[],nextCursor:null,selected:{revisionId:"d".repeat(64),narrative:{...saved,summary:"허용된 이전 분석"}}});
    renderProviders(<AiRideAnalysisCard activityId={`viewer-history-${authenticated}`} enabled />, {authenticated});
    expect(await screen.findByText("허용된 활동 분석")).toBeInTheDocument();
    fireEvent.click(screen.getByText("이전 AI 분석 보기"));fireEvent.click(await screen.findByRole("button",{name:/viewer-old/}));
    expect(await screen.findByText("허용된 이전 분석")).toBeInTheDocument();
    fireEvent.click(screen.getByText("현재 분석으로 돌아가기"));
    expect(await screen.findByText("전체 코칭 요약")).toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"다시 분석"})).not.toBeInTheDocument();
    expect(narrativeApiMocks.generate).not.toHaveBeenCalled();
  });

  it("hides cached comparison text after the server revokes narrative access", async () => {
    narrativeApiMocks.peek.mockResolvedValue({ ...narrative([segment(0, 10, "private prior rides")]), stale: true });
    narrativeApiMocks.generate.mockRejectedValue(Object.assign(new Error("Access denied"), { code: "permission-denied" }));
    renderWithProviders(<AiRideAnalysisCard isActivityOwner activityId="revoke-cached-grounding" enabled />);
    expect(await screen.findByText("private prior rides")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "변경사항 반영해 다시 분석" }));
    await waitFor(() => expect(screen.queryByText("private prior rides")).not.toBeInTheDocument());
    expect(screen.queryByText("전체 코칭 요약")).not.toBeInTheDocument();
  });

  it("omits absent legacy metrics and uses saved segment boundaries for the timeline", async () => {
    const saved = narrative([segment(0, 12.5, "legacy coaching")]);
    const legacy = saved as unknown as { overall: Record<string, unknown>; segments: Record<string, unknown>[] };
    delete legacy.overall.totalDistanceKm;
    for (const key of ["avgSpeedKmh", "avgPowerW", "avgHr", "relWind"]) delete legacy.segments[0][key];
    narrativeApiMocks.peek.mockResolvedValue(saved);
    const { container } = renderWithProviders(<AiRideAnalysisCard isActivityOwner activityId="legacy-missing-metrics" enabled />);
    await screen.findByText("legacy coaching");
    expect(container.textContent).not.toMatch(/undefined|NaN|ai\.wind\./);
    expect(screen.queryByText(/0W|HR0|0km\/h/)).not.toBeInTheDocument();
    expect(screen.getByText("12.5km")).toBeInTheDocument();
    expect(screen.getByTitle(/0–12.5km/)).toBeInTheDocument();
  });

  it("preserves recorded zero speed and power rather than treating them as missing", async () => {
    narrativeApiMocks.peek.mockResolvedValue(narrative([{ ...segment(0, 1, "recorded resting segment"), avgSpeedKmh: 0, avgPowerW: 0 }]));
    renderWithProviders(<AiRideAnalysisCard isActivityOwner activityId="recorded-zero-metrics" enabled />);
    expect(await screen.findByText(/0km\/h · 0W/)).toBeInTheDocument();
  });

});

it("selects saved narrative content and returns to the current result without generation", async () => {
  const current = narrative([segment(0, 10, "현재 구간 코칭")]);
  const previous = { ...narrative([segment(0, 5, "당시 구간 코칭")]), summary: "당시 분석 요약", generatedAt: 2 };
  narrativeApiMocks.peek.mockResolvedValue(current);
  narrativeApiMocks.history.mockResolvedValueOnce({ items: [{ revisionId: "a".repeat(64), generatedAt: 1e100, version: "old-v1" }], nextCursor: null, selected: null })
    .mockResolvedValueOnce({ items: [], nextCursor: null, selected: { revisionId: "a".repeat(64), narrative: previous } });
  const before = narrativeApiMocks.generate.mock.calls.length;
  renderWithProviders(<AiRideAnalysisCard isActivityOwner activityId="history-content" enabled />);
  await screen.findByText("현재 구간 코칭");
  fireEvent.click(screen.getByRole("button", { name: "이전 AI 분석 보기" }));
  fireEvent.click(await screen.findByRole("button", { name: /old-v1/ }));
  await screen.findByText("당시 분석 요약");
  expect(screen.getByText("당시 구간 코칭")).toBeInTheDocument();
  expect(screen.queryByText("현재 구간 코칭")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "현재 분석으로 돌아가기" }));
  expect(screen.getByText("현재 구간 코칭")).toBeInTheDocument();
  expect(narrativeApiMocks.generate).toHaveBeenCalledTimes(before);
});

it("keeps the selected narrative through a failed history read but clears it on access denial", async () => {
  const current = narrative([segment(0, 10, "현재 유지 코칭")]);
  const previous = { ...narrative([segment(0, 5, "이전 보존 코칭")]), summary: "이전 보존 분석", generatedAt: 3 };
  narrativeApiMocks.peek.mockResolvedValue(current);
  narrativeApiMocks.history.mockResolvedValueOnce({ items: [{ revisionId: "b".repeat(64), generatedAt: 3, version: "saved-v2" }], nextCursor: null, selected: null })
    .mockResolvedValueOnce({ items: [], nextCursor: null, selected: { revisionId: "b".repeat(64), narrative: previous } })
    .mockRejectedValueOnce(Error("offline"))
    .mockRejectedValueOnce(Object.assign(Error("denied"), { code: "functions/permission-denied" }));
  renderWithProviders(<AiRideAnalysisCard isActivityOwner activityId="history-failure" enabled />);
  await screen.findByText("현재 유지 코칭");
  fireEvent.click(screen.getByRole("button", { name: "이전 AI 분석 보기" }));
  fireEvent.click(await screen.findByRole("button", { name: /saved-v2/ }));
  await screen.findByText("이전 보존 분석");
  fireEvent.click(screen.getByRole("button", { name: "이전 AI 분석 보기" }));
  await screen.findByRole("alert");
  expect(screen.getByText("이전 보존 분석")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "이전 AI 분석 보기" }));
  await waitFor(() => expect(screen.queryByText("이전 보존 분석")).not.toBeInTheDocument());
  expect(screen.queryByText("현재 유지 코칭")).not.toBeInTheDocument();
});


it("preserves summary-only current and historical analysis without a segment timeline or generation", async () => {
  const current = { ...narrative([]), summary: "현재 요약만 있는 분석" };
  const previous = { ...narrative([]), summary: "당시 요약만 있는 분석", shareSummary: null, generatedAt: 2 };
  narrativeApiMocks.peek.mockResolvedValue(current);
  narrativeApiMocks.history.mockResolvedValueOnce({ items: [{ revisionId: "c".repeat(64), generatedAt: 2, version: "summary-only" }], nextCursor: null, selected: null })
    .mockResolvedValueOnce({ items: [], nextCursor: null, selected: { revisionId: "c".repeat(64), narrative: previous } });
  const before = narrativeApiMocks.generate.mock.calls.length;
  const { container } = renderWithProviders(<AiRideAnalysisCard isActivityOwner activityId="summary-only-history" enabled />);
  await screen.findByText(current.summary);
  fireEvent.click(screen.getByRole("button", { name: "이전 AI 분석 보기" }));
  fireEvent.click(await screen.findByRole("button", { name: /summary-only/ }));
  await screen.findByText(previous.summary);
  expect(screen.queryByText(current.summary)).not.toBeInTheDocument();
  expect(container).not.toHaveTextContent("Infinity");
  expect(screen.queryByText("30km")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "현재 분석으로 돌아가기" }));
  expect(screen.getByText(current.summary)).toBeInTheDocument();
  expect(narrativeApiMocks.generate).toHaveBeenCalledTimes(before);
});

it("does not resurrect a legacy preview when the shared cache reader denies access",async()=>{
 narrativeApiMocks.peek.mockRejectedValue({code:"permission-denied"});
 renderProviders(<AiRideAnalysisCard activityId="public-denied-cache" enabled summaryPreview="회수된 본문"/>,{authenticated:false});
 await waitFor(()=>expect(narrativeApiMocks.peek).toHaveBeenCalled());
 await act(async()=>{});expect(screen.queryByText("회수된 본문")).not.toBeInTheDocument();
 expect(narrativeApiMocks.generate).not.toHaveBeenCalled();
});

  describe("snapshot reanalysis notice", () => {
    const states = [
      { name: "analyst_updated", extra: { reanalysisAvailable: "analyst_updated" as const, stale: false }, badge: null, button: "새 분석가로 다시 분석" },
      { name: "inputs_changed", extra: { reanalysisAvailable: "inputs_changed" as const, stale: true }, badge: null, button: "변경사항 반영해 다시 분석" },
      { name: "legacy stale fallback", extra: { stale: true }, badge: null, button: "변경사항 반영해 다시 분석" },
      { name: "explicit null with stale (server says no notice)", extra: { stale: true, reanalysisAvailable: null }, badge: null, button: null },
      { name: "null", extra: { reanalysisAvailable: null, stale: false }, badge: null, button: null },
    ];
    const allBadges = ["새 분석가로 다시 분석 가능", "활동 데이터가 바뀌었어요"];
    const allButtons = ["새 분석가로 다시 분석", "변경사항 반영해 다시 분석"];

    function snapshot(extra: Partial<ActivityNarrative>) {
      return {
        ...narrative([segment(0, 10, "스냅샷 구간 코칭")]),
        narrativeVersion: "rsn-v69",
        generatedAt: Date.UTC(2026, 9, 20, 3, 0),
        prescriptions: [{ horizon: "ride", theme: "pacing", title: "페이싱", detail: "스냅샷 처방" }],
        ...extra,
      } as ActivityNarrative & { hit: true };
    }

    function expectSnapshotContentVisible(container: HTMLElement) {
      expect(screen.getByText("전체 코칭 요약")).toBeInTheDocument();
      expect(screen.getByText("스냅샷 구간 코칭")).toBeInTheDocument();
      expect(screen.getByText("스냅샷 처방")).toBeInTheDocument();
      expect(container).toHaveTextContent("· 분석가 v69");
      expect(container.querySelector("time")).not.toBeNull();
    }

    it.each(states)("owner sees the $name badge and button with the full snapshot", async ({ name, extra, badge, button }) => {
      narrativeApiMocks.peek.mockResolvedValue(snapshot(extra));
      const { container } = renderWithProviders(<AiRideAnalysisCard activityId={`snapshot-owner-${name}`} enabled isActivityOwner />, { authenticated: true });
      expect(await screen.findByText("스냅샷 구간 코칭")).toBeInTheDocument();
      expectSnapshotContentVisible(container);
      for (const text of allBadges) {
        if (text === badge) expect(screen.getByText(text)).toBeInTheDocument();
        else expect(screen.queryByText(text)).not.toBeInTheDocument();
      }
      for (const label of allButtons) {
        if (label === button) expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
        else expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
      }
      if (button === null) expect(screen.getByRole("button", { name: "다시 분석", exact: true })).toBeInTheDocument();
      expect(narrativeApiMocks.generate).not.toHaveBeenCalled();
    });

    it.each(states)("non-owner sees only time and analyst version for $name", async ({ name, extra }) => {
      narrativeApiMocks.peek.mockResolvedValue(snapshot(extra));
      const { container } = renderWithProviders(<AiRideAnalysisCard activityId={`snapshot-viewer-${name}`} enabled />, { authenticated: true });
      expect(await screen.findByText("스냅샷 구간 코칭")).toBeInTheDocument();
      expectSnapshotContentVisible(container);
      for (const text of allBadges) expect(screen.queryByText(text)).not.toBeInTheDocument();
      for (const label of allButtons) expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
      expect(screen.queryByText("재분석 필요")).not.toBeInTheDocument();
    });

    it("owner reanalyzes with the new analyst through the forceRefresh path", async () => {
      narrativeApiMocks.peek.mockResolvedValue(snapshot({ reanalysisAvailable: "analyst_updated" }));
      narrativeApiMocks.generate.mockResolvedValue({ ...snapshot({ reanalysisAvailable: null }), narrativeVersion: "rsn-v70", summary: "새 분석가 요약" });
      const { container } = renderWithProviders(<AiRideAnalysisCard activityId="snapshot-analyst-refresh" enabled isActivityOwner />, { authenticated: true });
      fireEvent.click(await screen.findByRole("button", { name: "새 분석가로 다시 분석" }));
      expect(await screen.findByText("새 분석가 요약")).toBeInTheDocument();
      expect(narrativeApiMocks.generate).toHaveBeenCalledWith({ activityId: "snapshot-analyst-refresh", lang: "ko", forceRefresh: true }, expect.objectContaining({ auth: expect.anything() }));
      expect(container).toHaveTextContent("· 분석가 v70");
      expect(screen.queryByText("새 분석가로 다시 분석 가능")).not.toBeInTheDocument();
    });

    it("omits the analyst version when the saved analysis has none", async () => {
      narrativeApiMocks.peek.mockResolvedValue(snapshot({ narrativeVersion: "" }));
      const { container } = renderWithProviders(<AiRideAnalysisCard activityId="snapshot-no-version" enabled />);
      expect(await screen.findByText("스냅샷 구간 코칭")).toBeInTheDocument();
      expect(container).not.toHaveTextContent("분석가");
      expect(container.querySelector("time")).not.toBeNull();
    });

    it("does not render the server stop_heavy flag as a chip (AI 해석 입력 전용)", async () => {
      narrativeApiMocks.peek.mockResolvedValue(snapshot({ overall: { ...narrative([]).overall, flags: ["stop_heavy"] } }));
      renderWithProviders(<AiRideAnalysisCard activityId="snapshot-stop-heavy" enabled />);
      expect(await screen.findByText("AI 라이딩 분석")).toBeInTheDocument();
      expect(screen.queryByText("정지 많음")).not.toBeInTheDocument();
      expect(screen.queryByText("stop_heavy")).not.toBeInTheDocument();
    });
  });
