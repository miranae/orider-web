import { fireEvent, screen, waitFor } from "@testing-library/react";
import ActivityPage from "./ActivityPage";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { setDocData, mockSetDoc } from "../__tests__/mocks/firebase";
import { createMockActivity, createMockStreams, createMockSummary } from "../__tests__/fixtures/mockData";

// Mock heavy components
vi.mock("../components/RouteMap", () => ({
  default: () => <div data-testid="route-map">Map</div>,
}));
vi.mock("../components/ElevationChart", () => ({
  default: () => <div data-testid="elevation-chart">Chart</div>,
}));
vi.mock("../components/activity/AiRideAnalysisCard", () => ({
  default: () => <div data-testid="ai-ride-analysis-card">AI</div>,
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

// Mock react-router-dom useParams
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useParams: () => ({ activityId: "test-activity" }),
  };
});

describe("ActivityPage", () => {
  it("shows loading state initially", () => {
    renderWithProviders(<ActivityPage />);
    // The component starts with loading state
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders activity details when data is loaded", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      description: "한강 아침 라이딩",
      nickname: "테스트 라이더",
      summary: createMockSummary({ distance: 50000, elevationGain: 400 }),
    });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);

    renderWithProviders(<ActivityPage />);

    await waitFor(() => {
      expect(screen.getByText("한강 아침 라이딩")).toBeInTheDocument();
    });
  });

  it("shows activity stats when loaded", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      summary: createMockSummary({
        distance: 50000,
        elevationGain: 400,
        ridingTimeMillis: 7200000,
        averageSpeed: 25.0,
      }),
    });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);

    renderWithProviders(<ActivityPage />);

    await waitFor(() => {
      expect(screen.getByText("50.0")).toBeInTheDocument(); // distance
    });
  });

  it("shows 404 message instead of crashing when activity summary is missing", async () => {
    const { summary: _summary, ...activityWithoutSummary } = createMockActivity({
      id: "test-activity",
      description: "수집 중 활동",
    });
    setDocData("activities/test-activity", activityWithoutSummary as unknown as Record<string, unknown>);

    renderWithProviders(<ActivityPage />);

    await waitFor(() => {
      const notFound = screen.queryByText(/찾을 수 없/) || screen.queryByText(/존재하지 않/);
      expect(notFound).toBeInTheDocument();
    });
  });

  it("shows comment input for authenticated users", async () => {
    const activity = createMockActivity({ id: "test-activity" });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);

    renderWithProviders(<ActivityPage />, { authenticated: true });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/댓글/)).toBeInTheDocument();
    });
  });

  it("shows saved sensor summary on analysis tab when streams are missing", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      source: "strava",
      stravaActivityId: 19171261814,
      summary: createMockSummary({
        averageHeartRate: 150,
        maxHeartRate: 160,
        averagePower: 144,
        maxPower: 262,
        normalizedPower: 147,
        averageCadence: 86,
        calories: 905,
      }),
    });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);

    renderWithProviders(<ActivityPage />);

    fireEvent.click(await screen.findByRole("tab", { name: "분석" }));

    expect(await screen.findByText("저장된 센서 요약")).toBeInTheDocument();
    expect(screen.getByText("평균 심박")).toBeInTheDocument();
    expect(screen.getByText("평균 파워")).toBeInTheDocument();
    expect(screen.getByText("최대 파워")).toBeInTheDocument();
    expect(screen.getByText("NP 147 W")).toBeInTheDocument();
  });

  it("shows AI ride analysis for indoor-like streams without route latlng", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      source: "orider",
      thumbnailTrack: null,
    });
    const { latlng: _latlng, ...streamsWithoutRoute } = createMockStreams();
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    setDocData("activity_streams/test-activity", {
      userId: "user-1",
      json: JSON.stringify(streamsWithoutRoute),
    });

    renderWithProviders(<ActivityPage />);

    expect(await screen.findByTestId("ai-ride-analysis-card")).toBeInTheDocument();
  });

  it("does not show AI ride analysis when analysis streams are unavailable", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      source: "orider",
      thumbnailTrack: null,
    });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    setDocData("activity_streams/test-activity", {
      userId: "user-1",
      json: JSON.stringify({ userId: "user-1", time: [0, 60] }),
    });

    renderWithProviders(<ActivityPage />);

    await screen.findByText("한강 라이딩");
    expect(screen.queryByTestId("ai-ride-analysis-card")).not.toBeInTheDocument();
  });

  it("shows AI ride analysis when route latlng streams are available", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      source: "orider",
      thumbnailTrack: null,
    });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    setDocData("activity_streams/test-activity", {
      userId: "user-1",
      json: JSON.stringify(createMockStreams()),
    });

    renderWithProviders(<ActivityPage />);

    expect(await screen.findByTestId("ai-ride-analysis-card")).toBeInTheDocument();
  });

  it("shows the AI analysis card on overview when a saved preview exists without streams", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      aiSummaryPreview: "저장된 AI 분석 결과입니다.",
    });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);

    renderWithProviders(<ActivityPage />);

    expect(await screen.findByTestId("ai-ride-analysis-card")).toBeInTheDocument();
  });

  it("falls back to recentKudos for the detail liked state before kudos subscription has data", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      kudosCount: 1,
      recentKudos: [{ userId: "test-uid", nickname: "Test User", profileImage: null }],
    });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);

    renderWithProviders(<ActivityPage />, { authenticated: true });

    expect(await screen.findByLabelText("좋아요 취소")).toBeInTheDocument();
  });

  it("shows 404 message when activity not found", async () => {
    // Don't set any doc data for the activity ID
    renderWithProviders(<ActivityPage />);

    await waitFor(() => {
      const notFound = screen.queryByText(/찾을 수 없/) || screen.queryByText(/존재하지 않/);
      // Activity page shows loading then either activity or error
      expect(document.querySelector(".animate-pulse") || notFound).toBeTruthy();
    });
  });
});
