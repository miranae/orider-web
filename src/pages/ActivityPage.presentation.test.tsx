import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ActivityPage from "./ActivityPage";
import { renderWithProviders as renderProviders } from "../__tests__/utils/renderWithProviders";
import { createMockActivity, createMockStreams, createMockSummary } from "../__tests__/fixtures/mockData";
import { mockCallableInvocations, setCallableResult, setCollectionDocs, setDocData, simulateLogin } from "../__tests__/mocks/firebase";
import { ACTIVITY_METRICS_VERSION } from "@shared/types/activity-metrics";
import { resetRuntimeConfigForTests } from "../services/runtimeConfig";
import { clearRideRouteIntentMemoryForTests } from "../features/activity/detail/RideActivityRouteButton";

const routeMapProps = vi.hoisted(() => vi.fn());
const stravaPreview = vi.hoisted(() => vi.fn());
const mockRoute = { activityId: "test-activity" };

// 지도·캔버스 구현 대신 전달되는 실제 기록/선택 props를 확인한다.
vi.mock("../components/RouteMap", () => ({
  default: (props: unknown) => { routeMapProps(props); return <div data-testid="route-map">Map</div>; },
}));
vi.mock("react-chartjs-2", () => ({ Line: () => <div data-testid="restored-summary-curve" />, Bar: () => <div /> }));
vi.mock("../components/ElevationChart", () => ({ default: () => <div data-testid="elevation-chart" /> }));
vi.mock("../features/activity/share/ActivityShareButton", () => ({ ActivityShareButton: () => <button>share-card</button> }));
vi.mock("../components/activity/AiRideAnalysisCard", () => ({ default: () => <div data-testid="ai-ride-analysis-card" /> }));
vi.mock("../services/stravaSummaryPreview", () => ({ requestStravaSummaryPreview: stravaPreview, isLocalStravaSummaryPreview: () => false }));
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
  stravaPreview.mockReset();
  stravaPreview.mockResolvedValue({ data: { status: "unavailable", reason: "summary-not-ready" } });
  setCollectionDocs("courses", []);
  window.sessionStorage.clear();
  clearRideRouteIntentMemoryForTests();
});

describe("ActivityPage presentation", () => {
  // 실제 페이지·게시 컨트롤러 통합 렌더의 동시 실행 비용을 main page suite와 맞춘다.
  vi.setConfig({ testTimeout: 15_000 });
  it("keeps legacy public Insights links available in unified Analysis without owner-only comparison or publishing", async () => {
    mockRoute.activityId = "public-insights-tab";
    setDocData(`activities/${mockRoute.activityId}`, createMockActivity({ id: mockRoute.activityId, userId: "another-owner" }) as unknown as Record<string, unknown>);
    setCallableResult("getActivityOverview", { data: { status: "available", activityId: mockRoute.activityId, presentation: { coachSentence: "공개 인사이트 유지", session: { discipline: "bike", load: 42 } } } });
    renderWithProviders(<ActivityPage />, { route: `/ko/activity/${mockRoute.activityId}?tab=insights` });
    expect(await within(await screen.findByTestId("activity-analysis-domains")).findByText("공개 인사이트 유지")).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map(tab => tab.id)).toEqual(["activity-tab-overview", "activity-tab-analysis", "activity-tab-segments"]);
    expect(screen.getByRole("tab", { name: "분석" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("heading", { name: "요약 공유" })).not.toBeInTheDocument();
    expect(stravaPreview).not.toHaveBeenCalled();
  });

  it("canonicalizes legacy Insights without losing query parameters, navigation state or history", async () => {
    function LegacyNavigation() {
      const navigate = useNavigate(), location = useLocation();
      return <><button onClick={() => navigate("?tab=insights&origin=feed", { state: { fromFeed: true } })}>legacy link</button>
        <button onClick={() => navigate(-1)}>back from legacy</button>
        <output data-testid="legacy-location">{location.search}:{String(location.state?.fromFeed)}</output></>;
    }
    setDocData("activities/test-activity", createMockActivity({ id: "test-activity", userId: "test-uid" }) as unknown as Record<string, unknown>);
    renderWithProviders(<main data-testid="legacy-main"><ActivityPage /><LegacyNavigation /></main>, { authenticated: true });
    await screen.findByTestId("activity-stats-primary");
    const main = screen.getByTestId("legacy-main"); main.scrollTop = 360;
    fireEvent.click(screen.getByRole("button", { name: "legacy link" }));
    await waitFor(() => expect(screen.getByTestId("legacy-location")).toHaveTextContent("?tab=analysis&origin=feed:true"));
    expect(screen.getByRole("tab", { name: "분석" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(main.scrollTop).toBe(360);
    fireEvent.click(screen.getByRole("button", { name: "back from legacy" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "개요" })).toHaveAttribute("aria-selected", "true"));
    expect(main.scrollTop).toBe(360);
  });

  it("shows one stream sign-in prompt for a public run without metrics and keeps fallback analysis visible", async () => {
    resetRuntimeConfigForTests({ appEnvironment: "stage", activityAnalysisExpansionEnabled: false });
    setDocData("activities/test-activity", createMockActivity({ id: "test-activity", type: "Run", userId: "another-owner", thumbnailTrack: null,
      summary: createMockSummary({ averagePower: null, normalizedPower: null, averageHeartRate: null, calories: null }) }) as unknown as Record<string, unknown>);
    renderWithProviders(<ActivityPage />, { route: "/ko/activity/test-activity?tab=analysis" });
    await screen.findByRole("heading", { name: "로그인하고 상세 분석을 확인하세요" });
    await waitFor(() => expect(screen.getAllByRole("heading", { name: "로그인하고 상세 분석을 확인하세요" })).toHaveLength(1));
    expect(document.querySelector(".activity-detail-analysis-details")).toBeVisible();
    expect(document.querySelector(".activity-detail-technical-details")).toBeNull();
  });

  it("keeps AI analysis in Overview and rich training visuals in supplemental Analysis", async () => {
    mockRoute.activityId = "restored-dev-overview";
    const activity = createMockActivity({ id: mockRoute.activityId, userId: "test-uid", aiSummaryPreview: "기존 AI 요약" });
    setDocData(`activities/${activity.id}`, activity as unknown as Record<string, unknown>);
    setCallableResult("getActivityOverview", { data: {
      status: "available", activityId: activity.id, version: "activity-overview-v1", inputDigest: "fixture",
      presentation: { coachSentence: "dev 정본 활동 개요", session: { discipline: "bike", load: 220, normalizedPowerW: 190, intensityFactor: 0.83 },
        zones: [{ kind: "power", seconds: [120, 60, 30, 10], priority: "primary" }],
        powerFingerprint: [{ duration: "5m", watts: 219 }],
        priorFitnessStatus: { asOf: "before", ctl: 10, atl: 12, tsb: -2, formBand: "productive" },
        postFitnessStatus: { asOf: "after", ctl: 11, atl: 15, tsb: -4, formBand: "productive" } },
    } });
    renderWithProviders(<ActivityPage />, { authenticated: true });
    await screen.findByTestId("D1-2");
    expect(screen.queryByTestId("activity-analysis-domains")).not.toBeInTheDocument();
    expect(screen.getByTestId("ai-ride-analysis-card")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "이번 활동 한눈에" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이 요약을 Strava에 게시" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "분석" }));
    const summary = await screen.findByTestId("activity-analysis-domains");
    await within(summary).findByText("dev 정본 활동 개요");
    expect(within(summary).getByRole("img", { name: "강도 게이지 · IF 0.83 (FTP 1.00 기준)" })).toBeInTheDocument();
    expect(summary.querySelector(".activity-analysis-zone-track")).toBeInTheDocument();
    expect(within(summary).getByRole("img", { name: "체력 · CTL 10.0 → 11.0" })).toBeInTheDocument();
    expect(within(summary).getByRole("img", { name: "피로 · ATL 12.0 → 15.0" })).toBeInTheDocument();
    expect(within(summary).getByRole("img", { name: "폼 · TSB -2.0 → -4.0" })).toBeInTheDocument();
    expect(within(summary).getByTestId("restored-summary-curve")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-ride-analysis-card")).not.toBeInTheDocument();
    expect(summary).toBeVisible();
    expect(screen.queryByRole("button", { name: "상세 기록 보기" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("activity-summary-text")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "분석" }));
    expect(screen.queryByTestId("activity-overview-evidence")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ai-ride-analysis-card")).not.toBeInTheDocument();
    expect(screen.getByTestId("activity-analysis-domains")).toBe(summary);
    fireEvent.click(screen.getByRole("tab", { name: "개요" }));
    expect(screen.getAllByTestId("ai-ride-analysis-card")).toHaveLength(1);
    expect(screen.getByTestId("ai-ride-analysis-card")).toBeVisible();

  });

  it.each([{ load: 220, stale: false }, { load: null, stale: false }, { load: 220, stale: true }])("distinguishes accepted load $load from stored analysis TSS (stale=$stale) without replacing either", async ({ load, stale }) => {
    mockRoute.activityId = `load-provenance-owner-${load ?? "missing"}-${stale}`;
    const activity = createMockActivity({ id: mockRoute.activityId, userId: "test-uid" });
    setDocData(`activities/${activity.id}`, activity as unknown as Record<string, unknown>);
    setDocData(`activity_metrics/${activity.id}`, { version: ACTIVITY_METRICS_VERSION - Number(stale), computedAt: 1, tss: 46, np: 190, if: 0.83, durationSec: 2405, contextSnapshot: { ftp: 230 } });
    setCallableResult("getActivityOverview", { data: {
      status: "available", activityId: activity.id, version: "activity-overview-v1", inputDigest: "fixture",
      presentation: { coachSentence: "부하 출처 테스트", session: { discipline: "bike", ...(load == null ? {} : { load, loadKind: "tss" }) } },
    } });
    renderWithProviders(<ActivityPage />, { authenticated: true });
    await screen.findByTestId("activity-stats-primary");
    expect(screen.queryByTestId("activity-load-provenance")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "분석" }));
    await within(await screen.findByTestId("activity-analysis-domains")).findByText("부하 출처 테스트");
    const training = screen.getByRole("heading", { name: "훈련 부하와 체력" }).closest("section")!;
    expect(within(training).getByText("분석 TSS")).toBeInTheDocument();
    expect(within(training).getAllByText("46").length).toBeGreaterThan(0);
    if (load != null) expect(within(training).getAllByText(String(load)).length).toBeGreaterThan(0);
    if (load === 220 || load === 46.4) expect(training).toHaveTextContent("반영 훈련 부하");
    if (stale) expect(training).toHaveTextContent("이전 버전의 분석값");

  });

  it.each(["overview"])("preserves the viewport for direct %s, tab clicks, keyboard selection and browser back", async (initial) => {
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
      expect(screen.getByTestId("tab-location")).toHaveTextContent(`tab=${initial === "insights" ? "analysis" : initial}`);
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
      expect(screen.getByTestId("tab-location")).toHaveTextContent(`tab=${initial === "insights" ? "analysis" : initial}`);
      await expectViewportPreserved();
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });

  it.each([{ type: "Yoga", calories: null }, { type: "Yoga", calories: 0 }])("shows a secondary disclosure only when sparse $type has a metric (calories=$calories)", async ({ type, calories }) => {
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

  it.each([false, true])("offers the ride action only in Segments and groups eligible links (streams=%s)", async streamsAvailable => {
    setDocData("activities/test-activity", createMockActivity({ id: "test-activity", userId: "test-uid", source: "orider" }) as unknown as Record<string, unknown>);
    if (streamsAvailable) setDocData("activity_streams/test-activity", { userId: "test-uid", json: JSON.stringify(createMockStreams({ userId: "test-uid" })) });
    renderWithProviders(<ActivityPage />, { authenticated: true });
    await screen.findByTestId("activity-stats-primary");
    for (const name of ["개요", "분석", "비교"]) {
      fireEvent.click(screen.getByRole("tab", { name }));
      expect(screen.queryByRole("button", { name: "이 경로로 라이드" })).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("tab", { name: "구간" }));
    const action = await screen.findByRole("button", { name: "이 경로로 라이드" });
    expect(action).toHaveAttribute("aria-label", "이 경로로 라이드");
    expect(action.closest(".activity-detail-segment-actions")).toBeInTheDocument();
    expect(action.closest(".activity-detail-resizable-map")).not.toBeInTheDocument();
    if (streamsAvailable) {
      const group = within(action.parentElement!);
      const create = await group.findByRole("link", { name: "세그먼트 만들기" });
      const register = group.getByRole("link", { name: "코스 등록" });
      expect(create.parentElement).toBe(action.parentElement);
      expect(register.parentElement).toBe(action.parentElement);
    } else expect(within(action.parentElement!).queryByRole("link", { name: "세그먼트 만들기" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이 경로로 라이드" })).toBeEnabled();
  });

  it("keeps an in-flight route creation mounted when leaving Segments and completes the send", async () => {
    let resolveCreate!: (value: unknown) => void;
    setDocData("activities/test-activity", createMockActivity({ id: "test-activity", userId: "test-uid" }) as unknown as Record<string, unknown>);
    setCallableResult("createCourseFromActivity", new Promise(resolve => { resolveCreate = resolve; }));
    setCallableResult("sendCourseToApp", { data: {} });
    renderWithProviders(<ActivityPage />, { authenticated: true, route: "/ko/activity/test-activity?tab=segments" });
    const action = await screen.findByRole("button", { name: "이 경로로 라이드" });
    fireEvent.click(action);
    await waitFor(() => expect(mockCallableInvocations.some(call => call.name === "createCourseFromActivity")).toBe(true));
    fireEvent.click(screen.getByRole("tab", { name: "개요" }));
    expect(action).toBeInTheDocument();
    expect(action.closest(".activity-detail-segment-actions")).toHaveAttribute("hidden");
    expect(action).not.toBeVisible();
    await act(async () => { resolveCreate({ data: { courseId: "pending-course" } }); });
    await waitFor(() => expect(mockCallableInvocations).toContainEqual({ name: "sendCourseToApp", data: { courseId: "pending-course" } }));
    fireEvent.click(screen.getByRole("tab", { name: "구간" }));
    expect(await screen.findByRole("button", { name: "앱으로 전송됨" })).toBe(action);
    expect(action).toBeDisabled();
  });

  it("keeps the real Strava publisher and its pending/uncertain guard across ordinary tab changes", async () => {
    resetRuntimeConfigForTests({ stravaSummaryPreviewEnabled: true });
    let rejectPublish!: (error: Error) => void;
    const pending = new Promise((_resolve, reject) => { rejectPublish = reject; });
    void pending.catch(() => undefined);
    setDocData("activities/test-activity", createMockActivity({ id: "test-activity", userId: "test-uid", source: "orider" }) as unknown as Record<string, unknown>);
    stravaPreview.mockResolvedValue({ data: { status: "ready", activityId: "test-activity", stravaActivityId: "12345", lang: "ko", shareText: "서버 요약", summaryBlock: "[O-Rider Summary]\n서버 요약", previewDigest: "review-v1", version: 1, generatedAt: 1, targetVerified: true, publishStatus: { status: "unavailable" } } });
    setCallableResult("stravaPublishActivitySummary", pending);
    renderWithProviders(<ActivityPage />, { authenticated: true });
    fireEvent.click(await screen.findByRole("tab", { name: "분석" }));
    const publish = await screen.findByRole("button", { name: "이 요약을 Strava에 게시" });
    const panel = publish.closest(".activity-detail-analysis-content")!;
    fireEvent.click(publish);
    await waitFor(() => expect(mockCallableInvocations.filter(call => call.name === "stravaPublishActivitySummary")).toHaveLength(1));
    fireEvent.click(screen.getByRole("tab", { name: "구간" }));
    expect(panel).toHaveAttribute("hidden");
    expect(publish).toBeInTheDocument();
    expect(publish).not.toBeVisible();
    expect(screen.queryByTestId("D1-6")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "개요" }));
    expect(publish).toBeInTheDocument(); expect(publish).not.toBeVisible();
    expect(screen.getByTestId("D1-6")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "분석" }));
    expect(publish).toBeDisabled();
    expect(publish).toHaveAttribute("aria-busy", "true");
    expect(stravaPreview).toHaveBeenCalledTimes(1);
    await act(async () => { rejectPublish(new Error("response not confirmed")); });
    fireEvent.click(screen.getByRole("tab", { name: "구간" }));
    fireEvent.click(screen.getByRole("tab", { name: "분석" }));
    expect(screen.getByRole("button", { name: "이 요약을 Strava에 게시" })).toBe(publish);
    expect(publish).toBeDisabled();
    expect(screen.getByLabelText("이 요약을 게시할 내 Strava 활동 링크")).toBeDisabled();
    expect(mockCallableInvocations.filter(call => call.name === "stravaPublishActivitySummary")).toHaveLength(1);
    expect(stravaPreview).toHaveBeenCalledTimes(1);
  });

});

it("opens management without duplicating domain actions and restores focus after Escape", async () => {
  const id = "management-owner";
  setDocData(`activities/${id}`, createMockActivity({ id, userId: "test-uid" }) as unknown as Record<string, unknown>);
  renderWithProviders(<ActivityPage />, { authenticated: true, route: `/ko/activity/${id}` });
  const trigger = await screen.findByRole("button", { name: "활동 관리" });
  trigger.focus(); fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "활동 관리" });
  expect(within(dialog).getByRole("link", { name: "활동 정보 편집" })).toHaveAttribute("href", `/ko/activity/${id}/edit`);
  expect(within(dialog).queryByText("사진 추가")).not.toBeInTheDocument();
  expect(within(dialog).queryByText("코스로 만들기")).not.toBeInTheDocument();
  fireEvent.keyDown(dialog, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "활동 관리" })).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("closes management immediately when the authenticated owner changes", async () => {
  const id = "management-account-scope";
  setDocData(`activities/${id}`, createMockActivity({ id, userId: "test-uid" }) as unknown as Record<string, unknown>);
  renderWithProviders(<ActivityPage />, { authenticated: true, route: `/ko/activity/${id}` });
  fireEvent.click(await screen.findByRole("button", { name: "활동 관리" }));
  act(() => simulateLogin({ uid: "different-user", displayName: "Other" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "활동 관리" })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "활동 관리" }));
  const menu = within(screen.getByRole("dialog", { name: "활동 관리" }));
  expect(menu.getByRole("button", { name: "내보내기" })).toBeInTheDocument();
  expect(menu.queryByRole("link", { name: "활동 정보 편집" })).not.toBeInTheDocument();
  expect(menu.queryByRole("radio")).not.toBeInTheDocument();
  expect(menu.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
});

it("does not let an open management dialog change its target activity", async () => {
  let navigate!: ReturnType<typeof useNavigate>;
  function Navigation() { navigate = useNavigate(); return null; }
  for (const id of ["management-a", "management-b"]) setDocData(`activities/${id}`, createMockActivity({ id, userId: "test-uid", description: id }) as unknown as Record<string, unknown>);
  renderWithProviders(<><ActivityPage /><Navigation /></>, { authenticated: true, route: "/ko/activity/management-a" });
  fireEvent.click(await screen.findByRole("button", { name: "활동 관리" }));
  act(() => navigate("/ko/activity/management-b"));
  await screen.findByRole("heading", { name: "management-b", level: 1 });
  expect(screen.queryByRole("dialog", { name: "활동 관리" })).not.toBeInTheDocument();
});

it("registers another rider's public route without entering the owner-only stream wizard", async () => {
  const id = "public-route-register";
  setDocData(`activities/${id}`, createMockActivity({ id, userId: "another-owner", source: "orider", visibility: "everyone", nickname: "", description: "공개 라이딩" }) as unknown as Record<string, unknown>);
  setCallableResult("createCourseFromActivity", { data: { courseId: "registered-public-course" } });
  renderProviders(<Routes>
    <Route path="/ko/activity/:activityId" element={<ActivityPage />} />
    <Route path="/ko/course/:courseId" element={<p>등록된 공개 코스</p>} />
  </Routes>, { authenticated: true, route: `/ko/activity/${id}?tab=segments` });
  const register = await screen.findByRole("button", { name: "코스 등록" });
  expect(screen.getByRole("link", { name: "라이더" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "세그먼트 만들기" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "코스 등록" })).not.toBeInTheDocument();
  fireEvent.click(register);
  expect(await screen.findByText("등록된 공개 코스")).toBeInTheDocument();
  expect(mockCallableInvocations.filter(call => call.name === "createCourseFromActivity")).toHaveLength(1);
  expect(mockCallableInvocations.some(call => call.name === "getActivityStreamsForSegment" || call.name === "sendCourseToApp")).toBe(false);
});

it("does not offer route creation or app transfer for another rider's nonpublic activity", async () => {
  const id = "nonpublic-route-actions";
  setDocData(`activities/${id}`, createMockActivity({ id, userId: "another-owner", source: "orider", visibility: "friends" }) as unknown as Record<string, unknown>);
  renderWithProviders(<ActivityPage />, { authenticated: true, route: `/ko/activity/${id}?tab=segments` });
  await screen.findByRole("tab", { name: "구간" });
  expect(screen.queryByRole("link", { name: "세그먼트 만들기" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "코스 등록" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "코스 등록" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "이 경로로 라이드" })).not.toBeInTheDocument();
});

it("places one primary record summary before the mobile story while retaining map and memo access", async () => {
  const media = vi.spyOn(window, "matchMedia").mockImplementation(query => ({
    matches: query.includes("max-width"), media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
  try {
    setDocData("activities/test-activity", createMockActivity({ id: "test-activity", userId: "test-uid", memo: "기록 설명 보존" }) as unknown as Record<string, unknown>);
    renderWithProviders(<ActivityPage />, { authenticated: true });
    const stats = await screen.findByTestId("activity-stats-primary");
    const story = await screen.findByRole("region", { name: "활동 이야기" });
    expect(screen.getAllByTestId("activity-stats-primary")).toHaveLength(1);
    expect(stats.compareDocumentPosition(story) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("D1-1")).toBeInTheDocument();
  } finally { media.mockRestore(); }
});
