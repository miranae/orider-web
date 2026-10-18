import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ActivityPage from "./ActivityPage";
import { renderWithProviders as renderProviders } from "../__tests__/utils/renderWithProviders";
import { createMockActivity, createMockSummary } from "../__tests__/fixtures/mockData";
import { setCallableResult, setCollectionDocs, setDocData } from "../__tests__/mocks/firebase";
import { ACTIVITY_METRICS_VERSION } from "@shared/types/activity-metrics";
import { resetRuntimeConfigForTests } from "../services/runtimeConfig";
import { clearRideRouteIntentMemoryForTests } from "../features/activity/detail/RideActivityRouteButton";

const routeMapProps = vi.hoisted(() => vi.fn());
const mockRoute = { activityId: "test-activity" };

// 지도·캔버스 구현 대신 전달되는 실제 기록/선택 props를 확인한다.
vi.mock("../components/RouteMap", () => ({
  default: (props: unknown) => { routeMapProps(props); return <div data-testid="route-map">Map</div>; },
}));
vi.mock("../components/ElevationChart", () => ({ default: () => <div data-testid="elevation-chart" /> }));
vi.mock("../features/activity/share/ActivityShareButton", () => ({ ActivityShareButton: () => <button>share-card</button> }));
vi.mock("../components/activity/AiRideAnalysisCard", () => ({ default: () => <div data-testid="ai-ride-analysis-card" /> }));
vi.mock("../components/activity/StravaSummaryPublishing", () => ({ default: () => <div data-testid="strava-summary-publishing" /> }));
vi.mock("../hooks/useFitnessTimeseries", () => ({ useFitnessTimeseries: () => ({ timeseries: null, loaded: true }) }));
vi.mock("../hooks/usePdc", () => ({ usePdc: () => ({ status: "missing", pdc: null }) }));
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

function renderWithProviders(ui: ReactElement, options: Parameters<typeof renderProviders>[1] = {}) {
  return renderProviders(<Routes><Route path="/ko/activity/:activityId" element={ui} /></Routes>, {
    route: `/ko/activity/${mockRoute.activityId}`,
    ...options,
  });
}

beforeEach(() => {
  resetRuntimeConfigForTests({ activityAnalysisExpansionEnabled: false });
  mockRoute.activityId = "test-activity";
  routeMapProps.mockClear();
  setCollectionDocs("courses", []);
  window.sessionStorage.clear();
  clearRideRouteIntentMemoryForTests();
});

describe("ActivityPage presentation", () => {
  it.each([{ load: 220, stale: false }, { load: 46.4, stale: false }, { load: 46, stale: false }, { load: null, stale: false }, { load: 220, stale: true }])("distinguishes accepted load $load from stored analysis TSS (stale=$stale) without replacing either", async ({ load, stale }) => {
    mockRoute.activityId = `load-provenance-owner-${load ?? "missing"}-${stale}`;
    const activity = createMockActivity({ id: mockRoute.activityId, userId: "test-uid" });
    setDocData(`activities/${activity.id}`, activity as unknown as Record<string, unknown>);
    setDocData(`activity_metrics/${activity.id}`, { version: ACTIVITY_METRICS_VERSION - Number(stale), computedAt: 1, tss: 46, np: 190, if: 0.83, durationSec: 2405, contextSnapshot: { ftp: 230 } });
    setCallableResult("getActivityOverview", { data: {
      status: "available", activityId: activity.id, version: "activity-overview-v1", inputDigest: "fixture",
      presentation: { coachSentence: "부하 출처 테스트", session: { discipline: "bike", ...(load == null ? {} : { load, loadKind: "tss" }) } },
    } });
    renderWithProviders(<ActivityPage />, { authenticated: true });
    await screen.findByText("부하 출처 테스트");
    if (load === 220 || load === 46.4) {
      expect(screen.getByTestId("activity-load-provenance")).toHaveTextContent(`반영 훈련 부하 ${load} · 분석 TSS 46`);
      expect(screen.getByTestId("activity-overview-summary")).toHaveTextContent(String(load));
      if (stale) expect(screen.getByTestId("activity-load-provenance")).toHaveTextContent("이전 버전의 분석값");
    } else expect(screen.queryByTestId("activity-load-provenance")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "분석" }));
    if (load === 220 || load === 46.4) expect(screen.getByTestId("activity-load-provenance")).toHaveTextContent(`반영 훈련 부하 ${load} · 분석 TSS 46`);
    else expect(screen.queryByTestId("activity-load-provenance")).not.toBeInTheDocument();
    if (stale) expect(screen.getByTestId("activity-load-provenance")).toHaveTextContent("이전 버전의 분석값");
  });


  it.each(["overview", "analysis"])("preserves the viewport for direct %s, tab clicks, keyboard selection and browser back", async (initial) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, writable: true, value: scroll });
    function HistoryNavigation() {
      const navigate = useNavigate(), location = useLocation();
      return <><button onClick={() => navigate(-1)}>browser back</button><span data-testid="tab-location">{location.search}</span></>;
    }
    try {
      setDocData("activities/test-activity", createMockActivity({ id: "test-activity", userId: "test-uid" }) as unknown as Record<string, unknown>);
      renderWithProviders(<main data-testid="tab-scroller"><ActivityPage /><HistoryNavigation /></main>, { authenticated: true, route: `/ko/activity/test-activity?tab=${initial}` });
      const current = await screen.findByRole("tab", { name: initial === "overview" ? "개요" : "분석" });
      const scroller = screen.getByTestId("tab-scroller");
      scroller.scrollTop = 240;
      async function expectViewportPreserved() {
        await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
        expect(scroll).not.toHaveBeenCalled();
        expect(scroller.scrollTop).toBe(240);
      }
      expect(current).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId("tab-location")).toHaveTextContent(`tab=${initial}`);
      await expectViewportPreserved();

      const compare = screen.getByRole("tab", { name: "비교" });
      fireEvent.click(compare);
      expect(compare).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId("tab-location")).toHaveTextContent("tab=compare");
      await expectViewportPreserved();

      compare.focus({ preventScroll: true });
      const overview = screen.getByRole("tab", { name: "개요" });
      const focus = vi.spyOn(overview, "focus");
      fireEvent.keyDown(compare, { key: "Home" });
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
      focus.mockRestore();
      expect(overview).toHaveFocus();
      expect(overview).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId("tab-location")).toHaveTextContent("tab=overview");
      await expectViewportPreserved();

      fireEvent.click(screen.getByRole("button", { name: "browser back" }));
      await waitFor(() => expect(compare).toHaveAttribute("aria-selected", "true"));
      expect(screen.getByTestId("tab-location")).toHaveTextContent("tab=compare");
      await expectViewportPreserved();
      fireEvent.click(screen.getByRole("button", { name: "browser back" }));
      await waitFor(() => expect(current).toHaveAttribute("aria-selected", "true"));
      expect(screen.getByTestId("tab-location")).toHaveTextContent(`tab=${initial}`);
      await expectViewportPreserved();
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });

  it.each([{ type: "Yoga", calories: null }, { type: "Ride", calories: null }, { type: "Yoga", calories: 0 }])("shows a secondary disclosure only when sparse $type has a metric (calories=$calories)", async ({ type, calories }) => {
    mockRoute.activityId = `sparse-secondary-${type}-${calories ?? "missing"}`;
    const activity = createMockActivity({ id: mockRoute.activityId, type, source: "apple_health", thumbnailTrack: null,
      summary: createMockSummary({ maxSpeed: 0, elevationGain: null, averageHeartRate: null, maxHeartRate: null,
        averagePower: null, normalizedPower: null, maxPower: null, averageCadence: null, calories, tss: null }) });
    setDocData(`activities/${activity.id}`, activity as unknown as Record<string, unknown>);
    renderWithProviders(<ActivityPage />);
    expect(await screen.findByTestId("activity-stats-primary")).toBeInTheDocument();
    if (calories == null) {
      expect(screen.queryByText("추가 기록 보기")).not.toBeInTheDocument();
      expect(screen.queryByTestId("activity-stats-secondary")).not.toBeInTheDocument();
    } else {
      expect(screen.getByText("추가 기록 보기")).toBeInTheDocument();
      expect(screen.getByTestId("activity-stats-secondary")).toHaveTextContent("0kcal");
    }
  });

  it("keeps the primary stats before the route and secondary stats in a native mobile disclosure", async () => {
    const activity = createMockActivity({ id: "test-activity", userId: "test-uid" });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    renderWithProviders(<ActivityPage />, { authenticated: true });
    const primary = await screen.findByTestId("activity-stats-primary");
    const secondary = screen.getByTestId("activity-stats-secondary");
    const map = screen.getByTestId("D1-1");
    const disclosure = secondary.closest("details")!;
    expect(primary.children).toHaveLength(3);
    expect(within(primary).getByText("이동거리")).toBeInTheDocument();
    expect(within(primary).getByText("평균 속도")).toBeInTheDocument();
    expect(primary.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(primary.closest(".activity-detail-summary")).toBe(secondary.closest(".activity-detail-summary"));
    expect(disclosure).not.toHaveAttribute("open");
    fireEvent.click(within(disclosure).getByText("추가 기록 보기"));
    await waitFor(() => expect(disclosure).toHaveAttribute("open"));
    expect(within(secondary).getByText("평균 심박")).toBeVisible();
    expect(routeMapProps.mock.lastCall?.[0]).toMatchObject({ showRouteEndpoints: true, routeLineWidth: 3 });
  });

  it("opens the secondary stats for the desktop hero without duplicate metric values", async () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn(query => ({ matches: query === "(min-width: 64rem)", media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
    try {
      setDocData("activities/test-activity", createMockActivity({ id: "test-activity" }) as unknown as Record<string, unknown>);
      renderWithProviders(<ActivityPage />);
      const secondary = await screen.findByTestId("activity-stats-secondary");
      await waitFor(() => expect(secondary.closest("details")).toHaveAttribute("open"));
      expect(screen.getAllByTestId("activity-stats-primary")).toHaveLength(1);
      expect(screen.getAllByTestId("activity-stats-secondary")).toHaveLength(1);
    } finally { window.matchMedia = original; }
  });

});
