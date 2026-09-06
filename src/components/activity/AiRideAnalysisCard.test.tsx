import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import AiRideAnalysisCard from "./AiRideAnalysisCard";
import type { ActivityNarrative, NarrativeSegment } from "../../hooks/useActivityNarrative";

const narrativeApiMocks = vi.hoisted(() => ({
  generate: vi.fn(),
  peek: vi.fn(),
  retrySummary: vi.fn(),
  appCheckThrottleRetryAfterMs: vi.fn(),
  claimActivityNarrativeAppCheckThrottleRecovery: vi.fn(),
}));

vi.mock("../../services/activityNarrativeApi", () => ({
  generateActivityNarrative: narrativeApiMocks.generate,
  peekActivityNarrative: narrativeApiMocks.peek,
  retryActivitySocialSummary: narrativeApiMocks.retrySummary,
  appCheckThrottleRetryAfterMs: narrativeApiMocks.appCheckThrottleRetryAfterMs,
  claimActivityNarrativeAppCheckThrottleRecovery: narrativeApiMocks.claimActivityNarrativeAppCheckThrottleRecovery,
}));

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
  it("preserves senior coaching and segment details alongside a separate share summary", async () => {
    narrativeApiMocks.peek.mockResolvedValue({
      ...narrative([segment(0, 10, "구간별 코칭 유지")]),
      socialSummary: { narrative: "공유할 성취 요약", achievements: [], shareText: "공유할 성취 요약" },
    });
    renderWithProviders(<AiRideAnalysisCard activityId="coaching-with-social-summary" enabled isActivityOwner />, { authenticated: true });
    expect(await screen.findByText("전체 코칭 요약")).toBeInTheDocument();
    expect(screen.getByText("공유할 성취 요약")).toBeInTheDocument();
    expect(screen.getByText("구간별 코칭 유지")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "공유용 요약" })).toBeInTheDocument();
  });

  beforeEach(() => {
    window.sessionStorage.clear();
    narrativeApiMocks.generate.mockReset();
    narrativeApiMocks.retrySummary.mockReset();
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

  it("retries only a missing share summary and keeps coaching visible through failure and success", async () => {
    narrativeApiMocks.peek.mockResolvedValue(narrative([segment(0, 10, "구간 코칭 보존")]));
    narrativeApiMocks.retrySummary.mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({ socialSummary: { narrative: "복구된 공유요약", achievements: [], shareText: "복구된 공유요약" } });
    renderWithProviders(<AiRideAnalysisCard activityId="retry-only-summary" enabled isActivityOwner />, { authenticated: true });
    expect(await screen.findByText("전체 코칭 요약")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "공유요약 다시 불러오기" }));
    expect(await screen.findByText("공유요약을 불러오지 못했습니다. 다시 시도해 주세요.")).toBeInTheDocument();
    expect(screen.getByText("구간 코칭 보존")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "공유요약 다시 불러오기" }));
    expect(await screen.findByText("복구된 공유요약")).toBeInTheDocument();
    expect(screen.getByText("전체 코칭 요약")).toBeInTheDocument();
    expect(narrativeApiMocks.retrySummary).toHaveBeenCalledWith("retry-only-summary", "ko");
    expect(narrativeApiMocks.generate).not.toHaveBeenCalled();
  });

  it("shows saved AI summary instead of a fresh analysis CTA when detail cache misses", async () => {
    renderWithProviders(
      <AiRideAnalysisCard
        activityId="strava_19098693942"
        enabled
        summaryPreview="전반적으로 안정적인 페이스의 라이딩이었습니다."
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("전반적으로 안정적인 페이스의 라이딩이었습니다.")).toBeInTheDocument();
    });
    expect(screen.queryByText("분석시작")).not.toBeInTheDocument();
    expect(screen.getByText(/저장된 AI 요약/)).toBeInTheDocument();
  });

  it("keeps the saved AI summary and hides raw auth errors when detail reload is unauthenticated", async () => {
    narrativeApiMocks.generate.mockRejectedValue(new Error("Unauthenticated"));

    renderWithProviders(
      <AiRideAnalysisCard
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
      expect(screen.getByText(/로그인 상태를 확인/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/분석 실패/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Unauthenticated/)).not.toBeInTheDocument();
  });

  it("shows a neutral restart action instead of raw App Check errors after one recovery reload", async () => {
    narrativeApiMocks.generate.mockRejectedValue(new Error(
      "AppCheck: Requests throttled due to previous 403 error. Attempts allowed again after 20h:58m:47s (appCheck/throttled).",
    ));

    renderWithProviders(
      <AiRideAnalysisCard activityId="app-check-throttle" enabled />,
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
      <AiRideAnalysisCard activityId="focused-segments-visible" enabled />,
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
      <AiRideAnalysisCard activityId="focused-segments-empty" enabled />,
    );

    await screen.findByText("전체 코칭 요약");
    expect(screen.queryByText(/구간별 분석/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "접기" })).not.toBeInTheDocument();
    expect(screen.getByTitle(/0–15km/)).toBeInTheDocument();
    expect(screen.getByTitle(/15–30km/)).toBeInTheDocument();
  });
});
