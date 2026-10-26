import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type AnalysisTab from "../components/AnalysisTab";
import type { ActivityAnalysisModel } from "../hooks/useActivityAnalysisModel";
import { createMockActivity } from "../__tests__/fixtures/mockData";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import ActivityPage from "./ActivityPage";
import { withStoredSummary } from "../__tests__/fixtures/activityDefaultSummary";
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
  const content = <div data-testid="summary-analysis">Analysis</div>;
  return props.renderSections ? props.renderSections({ load: content }) : content;
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
  it.each(["orider", "strava"] as const)("shows the %s deterministic memo on another rider's default overview tab", source => {
    mocks.model!.activity!.source = source;
    mocks.model!.activity!.userId = "another-rider";
    mocks.model!.isActivityOwner = false;
    mocks.model!.activity = withStoredSummary(mocks.model!.activity!, "▰ 피크 파워 (W)\n 1s 10s\n938 767");
    mocks.model!.overview.response = null;
    renderWithProviders(<ActivityPage />, { authenticated: false });
    expect(screen.getByRole("tab", { name: "개요" })).toHaveAttribute("aria-selected", "true");
    const story = within(screen.getByRole("region", { name: "활동 이야기" }));
    expect(story.getByText(/▰ 피크 파워/).textContent).toBe("▰ 피크 파워 (W)\n 1s 10s\n938 767");
    expect(story.queryByText(/Strava 원본/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "분석" }));
    expect(screen.queryByText(/▰ 피크 파워/)).not.toBeInTheDocument();
  });

  it.each(["pending", "error"] as const)("keeps verified Strava memos without a provider fallback while overview is %s", state => {
    mocks.model!.activity!.source = "strava";
    mocks.model!.overview.loading = state === "pending";
    mocks.model!.overview.error = state === "error";
    if (state === "pending") mocks.model!.activity = withStoredSummary(mocks.model!.activity!, "저장된 Orider 추가 분석");
    renderWithProviders(<ActivityPage />, { authenticated: false });
    const story = within(screen.getByRole("region", { name: "활동 이야기" }));
    expect(story.queryByText(/Strava 원본/)).not.toBeInTheDocument();
    if (state === "pending") expect(story.getByText("저장된 Orider 추가 분석")).toBeInTheDocument();
    expect(mocks.requestStreams).not.toHaveBeenCalled();
  });

  it("prefers current Orider analysis to a stored generated Strava memo", () => {
    mocks.model!.activity!.source = "strava";
    mocks.model!.activity = withStoredSummary(mocks.model!.activity!, "이전 추가 분석");
    mocks.model!.overview.response = { status: "available", activityId: "summary-only",
      defaultMemo: "현재 Orider 추가 분석", presentation: { session: { load: 12 } } } as never;
    renderWithProviders(<ActivityPage />, { authenticated: false });
    const story = within(screen.getByRole("region", { name: "활동 이야기" }));
    expect(story.getByText("현재 Orider 추가 분석")).toBeInTheDocument();
    expect(story.queryByText("이전 추가 분석")).not.toBeInTheDocument();
    expect(story.queryByText(/Strava 원본/)).not.toBeInTheDocument();
  });

  it("keeps authored Strava notes ahead of current Orider analysis", () => {
    mocks.model!.activity!.source = "strava";
    mocks.model!.activity = withStoredSummary(mocks.model!.activity!, "저장된 추가 분석");
    mocks.model!.activity!.feedContentV1 = { version: 1,
      sourceRevision: mocks.model!.activity!.defaultSummaryV1!.sourceRevision,
      revision: "authored", memo: "직접 작성한 메모", memoTruncated: false, totalPhotoCount: 0, photos: [] };
    mocks.model!.overview.response = { status: "available", activityId: "summary-only",
      defaultMemo: "현재 Orider 추가 분석", presentation: { session: { load: 12 } } } as never;
    renderWithProviders(<ActivityPage />, { authenticated: false });
    const story = within(screen.getByRole("region", { name: "활동 이야기" }));
    expect(story.getByText("직접 작성한 메모")).toBeInTheDocument();
    expect(story.queryByText("현재 Orider 추가 분석")).not.toBeInTheDocument();
    expect(story.queryByText("저장된 추가 분석")).not.toBeInTheDocument();
  });

  it.each([12, null])("러닝 GAP 카드 평균도 요약 스트립의 정본 값 %s를 전달한다", avgSpeedKph => {
    mocks.model!.sport = "run";
    mocks.model!.activity!.summary.averageSpeed = 10;
    mocks.model!.analysisTabProps!.sport = "run";
    Object.assign(mocks.model!.serverMetrics.metrics!, { discipline: "run", avgSpeedKph, runMetrics: { gapAvgSec: 337.29 } });
    renderWithProviders(<ActivityPage />, { authenticated: true });
    fireEvent.click(screen.getByRole("tab", { name: "분석" }));
    const gapCard = screen.getByText("지형 보정 페이스 (GAP)").parentElement!;
    expect(within(gapCard).getByText(avgSpeedKph == null ? "—" : "5:00/km")).toBeInTheDocument();
    expect(within(gapCard).queryByText("6:00/km")).not.toBeInTheDocument();
    expect(within(gapCard).getByText("5:37/km")).toBeInTheDocument();
    expect(mocks.model!.activity!.summary.averageSpeed).toBe(10);
    expect(mocks.requestStreams).toHaveBeenCalledOnce();
  });

  it("renders analysis with no downloaded streams or stream projection", () => {
    renderWithProviders(<ActivityPage />, { authenticated: true });
    expect(mocks.requestStreams).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "분석" }));
    expect(screen.getByTestId("summary-analysis")).toBeInTheDocument();
    expect(mocks.analysisProps.mock.lastCall?.[0]).toMatchObject({
      activityId: "summary-only", isOwner: true, streams: { time: [], distance: [] },
    });
    expect(mocks.requestStreams).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "상세 기록 보기" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "개요" }));
    fireEvent.click(screen.getByRole("tab", { name: "분석" }));
    expect(mocks.requestStreams).toHaveBeenCalledOnce();
    if (screen.queryByRole("button", { name: "활동 관리" })) fireEvent.click(screen.getByRole("button", { name: "활동 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "내보내기" }));
    expect(screen.queryByRole("dialog", { name: "활동 관리" })).not.toBeInTheDocument();
    expect(mocks.requestStreams).toHaveBeenCalledTimes(2);
  });

  it("분석 요청 scope가 개요에서 바뀌고 돌아와도 새 scope는 자동으로 불러온다", () => {
    const rendered = renderWithProviders(<ActivityPage />, { authenticated: true });
    fireEvent.click(screen.getByRole("tab", { name: "분석" }));
    expect(mocks.requestStreams).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("tab", { name: "개요" }));
    const nextRequest = vi.fn();
    mocks.model!.requestStreams = nextRequest;
    rendered.rerender(<ActivityPage />);
    expect(nextRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "분석" }));
    expect(nextRequest).toHaveBeenCalledOnce();
    rendered.rerender(<ActivityPage />);
    expect(nextRequest).toHaveBeenCalledOnce();
  });

  it("이미 불러오는 동안 추가 요청 없이 진행 상태를 보이고 정상 빈 결과는 재시도를 요구하지 않는다", () => {
    mocks.model!.loadingStreams = true;
    const rendered = renderWithProviders(<ActivityPage />, { authenticated: true, route: "/ko/activity/summary-only?tab=insights" });
    expect(screen.getByText("상세 기록을 불러오는 중…").closest('[role="status"]')).toBeInTheDocument();
    expect(mocks.requestStreams).not.toHaveBeenCalled();
    expect(screen.queryByText("이 기록에 표시할 차트 데이터가 없습니다.")).not.toBeInTheDocument();
    mocks.model!.loadingStreams = false;
    mocks.model!.streams = { userId: "test-uid", time: [], distance: [] } as never;
    rendered.rerender(<ActivityPage />);
    expect(screen.getByText("이 기록에 표시할 차트 데이터가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
    expect(mocks.requestStreams).not.toHaveBeenCalled();
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
    expect(screen.queryByText("로그인하고 상세 분석을 확인하세요")).not.toBeInTheDocument();
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
    if (screen.queryByRole("button", { name: "활동 관리" })) fireEvent.click(screen.getByRole("button", { name: "활동 관리" }));
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
    expect(screen.queryByText("상세 분석 데이터를 찾을 수 없습니다")).not.toBeInTheDocument();
    expect(screen.getByText("network request failed")).toBeInTheDocument();
    expect(screen.queryByText("로그인하고 상세 분석을 확인하세요")).not.toBeInTheDocument();
    expect(mocks.requestStreams).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "개요" }));
    fireEvent.click(screen.getByRole("tab", { name: "분석" }));
    expect(mocks.requestStreams).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "경로와 센서 기록 살펴보기" }));
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(mocks.model!.retryStreams).toHaveBeenCalledOnce();
  });

});


it("does not add an empty technical card for a sensorless public activity without overview", () => {
  mocks.model!.overview.enabled = false;
  mocks.model!.isActivityOwner = false;
  mocks.model!.sport = "other";
  mocks.model!.hasAnalysisStreams = false;
  mocks.model!.analysisTabProps = null;
  Object.assign(mocks.model!.activity!.summary, { averageHeartRate: null, maxHeartRate: null, averagePower: null, maxPower: null, averageCadence: null, maxCadence: null });
  renderWithProviders(<ActivityPage />, { route: "/ko/activity/summary-only?tab=analysis" });
  expect(screen.queryByRole("heading", { name: "상세 지표와 근거" })).not.toBeInTheDocument();
});
