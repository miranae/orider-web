// ActivityPage.test 의 공통 mock·설정을 그대로 쓰는 구간 선택 진입 회귀 테스트(파일 크기 예산 때문에 분리).
import { useLocation, useNavigate } from "react-router-dom";
import { resetRuntimeConfigForTests } from "../services/runtimeConfig";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { getDoc, getDocs, onSnapshot, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import ActivityPage from "./ActivityPage";
import { withStoredSummary, STORED_ACTIVITY_SUMMARY } from "../__tests__/fixtures/activityDefaultSummary";
import { activityFeedSourceRevision } from "../services/activityFeedContent";
import * as overviewHook from "../hooks/useActivityOverview";
import { ACTIVITY_METRICS_VERSION } from "@shared/types/activity-metrics";
import { clearRideRouteIntentMemoryForTests } from "../features/activity/detail/RideActivityRouteButton";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import {
  mockCallableInvocations,
  mockSignInWithPopup,
  mockUpdateDoc,
  simulateLogin,
  setCallableResult,
  setCollectionDocs,
  setDocData,
} from "../__tests__/mocks/firebase";
import { createMockActivity, createMockStreams, createMockSummary } from "../__tests__/fixtures/mockData";

const shareButtonProps = vi.hoisted(() => vi.fn());
const performanceChartProps = vi.hoisted(() => vi.fn());
const elevationChartProps = vi.hoisted(() => vi.fn());
const routeMapProps = vi.hoisted(() => vi.fn());
// 활동 재계산은 **그 활동의 자전거**로만 한다(#1950) — 지금 선택된 자전거가 아니다.
const mockBikeProfiles = vi.hoisted(() => vi.fn((): { profiles: Array<Record<string, unknown>> } => ({ profiles: [] })));
const mockVirtualPowerStream = vi.hoisted(() => vi.fn((): number[] => []));
const mockFitnessTimeseries = vi.hoisted(() => vi.fn(() => ({ timeseries: null, loaded: true })));
const mockPdc = vi.hoisted(() => vi.fn(() => ({ status: "missing", pdc: null })));
const stravaPublishingProps = vi.hoisted(() => vi.fn());
vi.mock("../hooks/useFitnessTimeseries", () => ({ useFitnessTimeseries: mockFitnessTimeseries }));
vi.mock("../hooks/usePdc", () => ({ usePdc: mockPdc }));
vi.mock("../hooks/useBikeProfiles", () => ({ useBikeProfiles: mockBikeProfiles }));
vi.mock("../utils/virtualPower", () => ({ calcVirtualPowerStream: mockVirtualPowerStream }));
vi.mock("../features/activity/share/ActivityShareButton", () => ({
  ActivityShareButton: (props: unknown) => {
    shareButtonProps(props);
    return <button>share-card</button>;
  },
}));

vi.mock("../features/activity/detail/ActivityPerformanceCharts", async importOriginal => {
  const actual = await importOriginal<typeof import("../features/activity/detail/ActivityPerformanceCharts")>();
  return { default: (props: Parameters<typeof actual.default>[0]) => { performanceChartProps(props); return <actual.default {...props} />; } };
});

// Mock heavy components
vi.mock("../components/RouteMap", () => ({
  default: (props: unknown) => { routeMapProps(props); return <div data-testid="route-map">Map</div>; },
}));
vi.mock("../components/ElevationChart", () => ({
  default: (props: unknown) => {
    elevationChartProps(props);
    return <div data-testid="elevation-chart">Chart{(props as { analysisPresentation?: { axisControls?: React.ReactNode; controls?: React.ReactNode } }).analysisPresentation?.axisControls}{(props as { analysisPresentation?: { controls?: React.ReactNode } }).analysisPresentation?.controls}</div>;
  },
}));
vi.mock("../components/activity/AiRideAnalysisCard", () => ({
  default: () => <div data-testid="ai-ride-analysis-card">AI</div>,
}));
vi.mock("../components/activity/StravaSummaryPublishing", () => ({
  default: (props: unknown) => {
    stravaPublishingProps(props);
    return <div data-testid="strava-summary-publishing" />;
  },
}));

// ActivityPage 의 분석 탭 임포트 체인(PowerCurveChart 등)이 chart.js 의
// LogarithmicScale 을 register 하므로, 전역 chart.js mock(setup.ts)에 없는
// 스케일/요소까지 포함해 이 파일 전용으로 보강한다. (setup.ts 는 수정 금지)
vi.mock("chart.js", () => ({
  Chart: { register: vi.fn() },
  CategoryScale: class {},
  LinearScale: class {},
  LogarithmicScale: class {},
  BarElement: class {},
  LineElement: class {},
  PointElement: class {},
  ArcElement: class {},
  Title: class {},
  Tooltip: class {},
  Legend: class {},
  Filler: class {},
}));

const { mockRoute } = vi.hoisted(() => ({
  mockRoute: { activityId: "test-activity" },
}));
const COURSE_ASYNC_TIMEOUT = 10_000;
const findSentButton = () => screen.findByRole(
  "button",
  { name: "앱으로 전송됨" },
  { timeout: COURSE_ASYNC_TIMEOUT },
);
const waitForCallableCount = (name: string, count: number) => waitFor(
  () => expect(mockCallableInvocations.filter((call) => call.name === name)).toHaveLength(count),
  { timeout: COURSE_ASYNC_TIMEOUT },
);

// Mock react-router-dom useParams
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useParams: () => ({ activityId: mockRoute.activityId }),
  };
});

describe("ActivityPage range selection entry points", () => {
  // ActivityPage 전체 렌더는 무거워서 기본 5초로는 러너 부하에 따라 케이스가 바뀌며 간헐 실패한다
  // (2026-08-09 CI `check` 에서 승격 차단). 이미 다수 테스트가 개별로 15_000 을 달고 있어
  // 파일 기본값을 같은 값으로 맞춘다.
  vi.setConfig({ testTimeout: 15_000 });

  beforeEach(() => {
    resetRuntimeConfigForTests({ activityAnalysisExpansionEnabled: false });
    mockFitnessTimeseries.mockReturnValue({ timeseries: null, loaded: true });
    mockPdc.mockReturnValue({ status: "missing", pdc: null });
    mockBikeProfiles.mockReturnValue({ profiles: [] });
    mockVirtualPowerStream.mockReturnValue([]);
    stravaPublishingProps.mockClear();
    elevationChartProps.mockClear();
    routeMapProps.mockClear();
    mockRoute.activityId = "test-activity";
    setCollectionDocs("courses", []);
    vi.mocked(getDocs).mockClear();
    vi.mocked(onSnapshot).mockClear();
    vi.mocked(onAuthStateChanged).mockClear();
    vi.mocked(where).mockClear();
    vi.mocked(httpsCallable).mockClear();
    window.sessionStorage.clear();
    clearRideRouteIntentMemoryForTests();
  });

  it("starts, applies, clears and reselects a time range for a run without a distance stream (no chart to drag)", async () => {
    resetRuntimeConfigForTests({ activityAnalysisExpansionEnabled: false });
    const id = mockRoute.activityId = "run-without-distance", epoch = 1791375809874, time = Array.from({ length: 101 }, (_, index) => epoch + index * 1000);
    setDocData(`activities/${id}`, createMockActivity({ id, type: "Run", userId: "test-uid", source: "orider", startTime: epoch,
      summary: createMockSummary({ ridingTimeMillis: 100000, elapsedTimeMillis: 100000 }) }) as unknown as Record<string, unknown>);
    // 거리·고도·경로·랩이 없다 — 드래그할 차트도, 고를 랩도 없어 시작 버튼과 시간 입력만으로 끝까지 간다.
    setDocData(`activity_streams/${id}`, { userId: "test-uid", json: JSON.stringify({ time, heartrate: time.map((_, index) => 120 + index % 20) }) });
    renderWithProviders(<ActivityPage />, { authenticated: true, route: `/ko/activity/${id}?tab=analysis` });
    fireEvent.click(await screen.findByRole("button", { name: "구간 분석" }));
    expect(screen.getByRole("button", { name: "구간 선택 종료" })).toHaveAttribute("aria-pressed", "true");
    const apply = (start: string, end: string) => { fireEvent.change(screen.getByLabelText("시작 시간"), { target: { value: start } });
      fireEvent.change(screen.getByLabelText("끝 시간"), { target: { value: end } }); fireEvent.click(screen.getByRole("button", { name: "범위 적용" })); };
    apply("0:20", "0:40");
    expect(await screen.findByText("구간 분석을 준비 중입니다", { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "범위 지우기" }));
    expect(screen.queryByText("구간 분석을 준비 중입니다", { exact: false })).not.toBeInTheDocument();
    apply("0:50", "1:10");
    expect(await screen.findByText("구간 분석을 준비 중입니다", { exact: false })).toBeInTheDocument();
  });
  it("lets a later peak location replace a dragged range on the chart and map (owner)", async () => {
    const id = mockRoute.activityId = "drag-then-peak", epoch = 1791375809874, distance = Array.from({ length: 101 }, (_, index) => index * 10);
    const peak = { durationSec: 60, startIndex: 10, endIndex: 70, startOffsetSec: 10, fromKm: 0.1, toKm: 0.3, avgPowerW: 250, maxPowerW: 400, avgHr: null, maxHr: null, avgSpeedKmh: 36, maxSpeedKmh: 40, avgCadence: null };
    setDocData(`activities/${id}`, createMockActivity({ id, userId: "test-uid", source: "orider", startTime: epoch, summary: createMockSummary({ distance: 1000, ridingTimeMillis: 100000, elapsedTimeMillis: 100000 }) }) as unknown as Record<string, unknown>);
    setDocData(`activity_metrics/${id}`, { version: ACTIVITY_METRICS_VERSION, computedAt: 1, discipline: "bike", isVirtualPower: false, peakEfforts: { peaks: [peak], highlight: peak, indexAxis: "route" } });
    setDocData(`activity_streams/${id}`, { userId: "test-uid", json: JSON.stringify(createMockStreams({ userId: "test-uid", distance, time: distance.map((_, index) => epoch + index * 1000),
      latlng: distance.map((_, index) => [37.5 + index / 10000, 127 + index / 10000]) as [number, number][], altitude: distance.map(() => 10), watts: undefined, heartrate: undefined, cadence: undefined, velocity_smooth: undefined })) });
    renderWithProviders(<ActivityPage />, { authenticated: true, route: `/ko/activity/${id}?tab=analysis` });
    await waitFor(() => expect(performanceChartProps.mock.lastCall?.[0].onVisualRangeChange).toBeDefined());
    act(() => performanceChartProps.mock.lastCall![0].onVisualRangeChange([80, 95]));
    // #1302 회귀: 드래그 범위가 지속 구간 선택이 되어 뒤에 고른 최고 노력 하이라이트를 가렸다.
    fireEvent.click(await screen.findByRole("button", { name: "차트·지도에서 구간 보기" }));
    await waitFor(() => expect(routeMapProps.mock.lastCall?.[0].highlightRange).toEqual({ startIndex: 10, endIndex: 30 }));
    fireEvent.click(screen.getByRole("tab", { name: "분석" }));
    expect(performanceChartProps.mock.lastCall?.[0].chartHighlightRange).toEqual([10, 30]);
  });
});
