import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type AnalysisTab from "../components/AnalysisTab";
import type { ActivityAnalysisModel } from "../hooks/useActivityAnalysisModel";
import { createMockActivity } from "../__tests__/fixtures/mockData";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import ActivityPage from "./ActivityPage";
import { signInWithPopup } from "firebase/auth";

const mocks = vi.hoisted(() => ({
  model: null as ActivityAnalysisModel | null,
  analysisProps: vi.fn(),
  lapProps: vi.fn(),
  requestStreams: vi.fn(),
}));
vi.mock("../hooks/useActivityAnalysisModel", () => ({ useActivityAnalysisModel: () => mocks.model }));
vi.mock("../hooks/useFitnessTimeseries", () => ({ useFitnessTimeseries: () => ({ timeseries: null }) }));
vi.mock("../hooks/usePdc", () => ({ usePdc: () => ({ pdc: null }) }));
vi.mock("../components/AnalysisTab", () => ({ default: (props: ComponentProps<typeof AnalysisTab>) => {
  mocks.analysisProps(props);
  return <div data-testid="summary-analysis">Analysis</div>;
}, AnalysisLapTable: (props: Record<string, unknown>) => { mocks.lapProps(props); return <div data-testid="summary-laps"><h3>랩 분석</h3>Laps</div>; } }));
vi.mock("../components/RouteMap", () => ({ default: () => <div /> }));
vi.mock("../components/ElevationChart", () => ({ default: () => <div /> }));
vi.mock("../components/activity/AiRideAnalysisCard", () => ({ default: () => <div /> }));
vi.mock("react-router-dom", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-router-dom")>(),
  useParams: () => ({ activityId: "summary-only" }),
  useOutletContext: () => null,
}));

beforeEach(() => {
  mocks.analysisProps.mockClear();
  mocks.lapProps.mockClear();
  mocks.requestStreams.mockClear();
  const activity = createMockActivity({ id: "summary-only", userId: "test-uid", source: "orider" });
  mocks.model = {
    activity, setActivity: vi.fn(), loadingActivity: false, activityLoadError: null,
    activityProcessing: false, retryActivity: vi.fn(), streams: null, effectiveStreams: null,
    loadingStreams: false, showStreamSpinner: false, streamsError: null, streamsSignInRequired: false, retryStreams: vi.fn(),
    requestStreams: mocks.requestStreams,
    serverMetrics: { status: "ready", metrics: { version: 35 } },
    overview: { loading: false, response: null, enabled: true, error: false, retry: vi.fn() },
    isActivityOwner: true, sport: "ride", streamSensorSummary: null,
    displayedSummary: activity.summary, avgPowerValue: null, normalizedPowerValue: null,
    hasStreamPowerCandidate: false, hasStreamHeartRateCandidate: false,
    hasStreamCadenceCandidate: false, hasAnalysisStreams: true, analysisProjection: null,
    sensorSelectionContext: {},
    analysisTabProps: {
      activityId: activity.id, isOwner: true, startTime: activity.startTime,
      sport: "ride", summary: activity.summary,
      streams: { userId: activity.userId, time: [], distance: [] },
      serverMetrics: { status: "ready", metrics: { version: 35 } },
    },
    canRecalculateVirtualPowerPreview: false, recalculateVirtualPowerPreview: vi.fn(),
    revertVirtualPowerPreview: vi.fn(), activePowerOverride: null,
  } as unknown as ActivityAnalysisModel;
});

describe("ActivityPage server summary presentation", () => {
  it.each([12, null])("러닝 GAP 카드 평균도 요약 스트립의 정본 값 %s를 전달한다", avgSpeedKph => {
    mocks.model!.sport = "run";
    mocks.model!.activity!.summary.averageSpeed = 10;
    mocks.model!.analysisTabProps!.sport = "run";
    Object.assign(mocks.model!.serverMetrics.metrics!, { discipline: "run", avgSpeedKph, runMetrics: { gapAvgSec: 337.29 } });
    renderWithProviders(<ActivityPage />, { authenticated: true });
    const gapCard = screen.getByText("지형 보정 페이스 (GAP)").parentElement!;
    expect(within(gapCard).getByText(avgSpeedKph == null ? "—" : "5:00/km")).toBeInTheDocument();
    expect(within(gapCard).queryByText("6:00/km")).not.toBeInTheDocument();
    expect(within(gapCard).getByText("5:37/km")).toBeInTheDocument();
    expect(mocks.model!.activity!.summary.averageSpeed).toBe(10);
    expect(mocks.requestStreams).not.toHaveBeenCalled();
  });

  it("renders analysis with no downloaded streams or stream projection", () => {
    renderWithProviders(<ActivityPage />, { authenticated: true });
    expect(mocks.requestStreams).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "분석" }));
    expect(screen.getByTestId("summary-analysis")).toBeInTheDocument();
    expect(mocks.analysisProps.mock.lastCall?.[0]).toMatchObject({
      activityId: "summary-only", isOwner: true, streams: { time: [], distance: [] },
    });
    expect(mocks.requestStreams).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "내보내기" }));
    expect(mocks.requestStreams).toHaveBeenCalledTimes(1);
  });

  it("keeps saved laps visible while requesting streams for matching and export", () => {
    mocks.model!.analysisTabProps!.analysisSummary = {
      schemaVersion: 1, laps: [{ number: 7, distanceKm: 1, durationMs: 300000 }],
      caloriesFallbackKcal: null, hasAnalysisStreams: true, sensors: null,
      correctedAverages: {
        averageHeartRate: null, maxHeartRate: null, averageCadence: null, maxCadence: null,
        averagePower: null, maxPower: null, normalizedPower: null, tss: null,
      },
    };
    renderWithProviders(<ActivityPage />, { authenticated: true });
    fireEvent.click(screen.getByRole("tab", { name: /구간/u }));
    expect(screen.getByTestId("summary-laps")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "랩 분석" })).toHaveLength(1);
    expect(mocks.requestStreams).toHaveBeenCalled();
  });
  it.each(["segments", "export"])("requests cold streams on direct %s entry even with server laps", tab => {
    mocks.model!.analysisTabProps!.analysisSummary = { schemaVersion: 1, laps: [{ number: 1, distanceKm: 1, durationMs: 300000 }] } as never;
    renderWithProviders(<ActivityPage />, { authenticated: true, route: `/ko/activity/summary-only?tab=${tab}` });
    expect(mocks.requestStreams).toHaveBeenCalled();
  });
  it("hides comparison for another rider, including a direct compare query", () => {
    mocks.model!.isActivityOwner = false;
    renderWithProviders(<ActivityPage />, { authenticated: true, route: "/ko/activity/summary-only?tab=compare" });
    expect(screen.queryByRole("tab", { name: "비교" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "개요" })).toHaveAttribute("aria-selected", "true");
  });
  it("raw 러닝 랩도 종목별 표에 그대로 전달하고 새 스트림을 요청하지 않는다", () => {
    const laps = [{ number: 1, distanceKm: 1, durationMs: 360000, avgSpeed: 12, avgCadence: 88 }];
    mocks.model!.sport = "run";
    mocks.model!.streams = { time: [], distance: [], laps } as never;
    mocks.model!.effectiveStreams = mocks.model!.streams;
    mocks.model!.analysisTabProps!.sport = "run";
    renderWithProviders(<ActivityPage />, { authenticated: true });
    fireEvent.click(screen.getByRole("tab", { name: /구간/u }));
    expect(screen.getByTestId("summary-laps")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "랩 분석" })).toHaveLength(1);
    expect(mocks.lapProps.mock.lastCall?.[0]).toMatchObject({ sport: "run", ftp: null, laps });
    expect(mocks.lapProps.mock.lastCall?.[0].laps).toBe(laps);
    expect(mocks.requestStreams).not.toHaveBeenCalled();
  });

  it("공개 요약·분석·내보내기는 인증 필요를 결측이나 재시도로 표시하지 않고 기존 로그인을 연다", async () => {
    mocks.model!.isActivityOwner = false;
    mocks.model!.hasAnalysisStreams = false;
    mocks.model!.analysisTabProps = null;
    mocks.model!.streamsSignInRequired = true;
    mocks.model!.streamsError = "SIGN_IN_REQUIRED";
    Object.assign(mocks.model!.serverMetrics.metrics!, { avgHr: 150, avgPower: 200, maxPower: 300, np: 210, avgCadence: 80 });
    renderWithProviders(<ActivityPage />);
    expect(screen.getByText("로그인하고 상세 분석을 확인하세요")).toBeInTheDocument();
    expect(screen.queryByText("SIGN_IN_REQUIRED")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "분석" }));
    expect(screen.getByText("로그인하고 상세 분석을 확인하세요")).toBeInTheDocument();
    expect(screen.queryByText("상세 분석 데이터를 찾을 수 없습니다")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
    expect(mocks.model!.retryStreams).not.toHaveBeenCalled();
    expect(screen.getByText("기록에 저장된 주요 수치입니다.")).toBeInTheDocument();
    expect(screen.getByText("저장된 센서 요약")).toBeInTheDocument();
    expect(screen.getAllByText("150").length).toBeGreaterThan(0);
    expect(screen.getAllByText("200").length).toBeGreaterThan(0);
    expect(screen.getByText("NP 210 W")).toBeInTheDocument();
    expect(screen.getAllByText("300").length).toBeGreaterThan(0);
    expect(screen.getAllByText("80").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "내보내기" }));
    const exportDialog = within(screen.getByRole("dialog", { name: "내보내기" }));
    expect(exportDialog.getByText("로그인하고 상세 분석을 확인하세요")).toBeInTheDocument();
    expect(mocks.requestStreams).not.toHaveBeenCalled();
    const calls = vi.mocked(signInWithPopup).mock.calls.length;
    fireEvent.click(exportDialog.getByRole("button", { name: "로그인" }));
    fireEvent.click(await screen.findByTestId("A1-1-1"));
    await waitFor(() => expect(vi.mocked(signInWithPopup).mock.calls.length).toBe(calls + 1));
    expect(screen.queryByText("SIGN_IN_REQUIRED")).not.toBeInTheDocument();
  });

  it("로그인된 사용자의 실제 스트림 오류는 기존 결측 제목과 재시도를 유지한다", () => {
    mocks.model!.hasAnalysisStreams = false;
    mocks.model!.analysisTabProps = null;
    mocks.model!.streamsError = "network request failed";
    renderWithProviders(<ActivityPage />, { authenticated: true });
    fireEvent.click(screen.getByRole("tab", { name: "분석" }));
    expect(screen.getByText("상세 분석 데이터를 찾을 수 없습니다")).toBeInTheDocument();
    expect(screen.getByText("network request failed")).toBeInTheDocument();
    expect(screen.queryByText("로그인하고 상세 분석을 확인하세요")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(mocks.model!.retryStreams).toHaveBeenCalledOnce();
  });

});
