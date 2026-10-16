import i18n from "i18next";
import { splitGlossaryText } from "../utils/termGlossary";
import { resetRuntimeConfigForTests } from "../services/runtimeConfig";
import { screen, waitFor, within, fireEvent } from "@testing-library/react";
import { where, limit } from "firebase/firestore";
import SegmentPage from "./SegmentPage";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { setDocData, setCollectionDocs, mockCallableInvocations } from "../__tests__/mocks/firebase";
import koSegment from "../i18n/resources/ko/segment.json";
import enSegment from "../i18n/resources/en/segment.json";

const cachedComparisonMocks = vi.hoisted(() => ({ getStreams: vi.fn(async () => null) }));
vi.mock("../hooks/useStrava", () => ({ useStrava: () => ({ getStreams: cachedComparisonMocks.getStreams }) }));
// Mock heavy components
vi.mock("../components/RouteMap", () => ({
  default: () => <div data-testid="route-map">Map</div>,
}));

// Mock useParams
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useParams: () => ({ segmentId: "seg-1" }),
  };
});

describe("SegmentPage", () => {
  beforeEach(() => resetRuntimeConfigForTests({ activityAnalysisExpansionEnabled: false }));
  it("keeps absent segment measurements unknown instead of crashing or displaying NaN", async () => {
    setDocData("segments/seg-1", { name: "Missing measurements", distance: null, averageGrade: null, maximumGrade: null, elevationHigh: null, elevationLow: null });
    renderWithProviders(<SegmentPage />, { route: "/ko/segment/seg-1" });
    await screen.findByText("Missing measurements");
    const summary = screen.getByTestId("D3-0");
    expect(within(summary).getAllByText("—").length).toBeGreaterThanOrEqual(3);
    expect(summary).not.toHaveTextContent("NaN");
  });
  it("keeps English gradient labels explainable and leaderboard counts singular/plural", () => {
    expect(splitGlossaryText(enSegment.averageGrade).some(part => part.termId === "grade")).toBe(true);
    expect(splitGlossaryText(enSegment.maxGrade).some(part => part.termId === "grade")).toBe(true);
    i18n.addResourceBundle("en", "segment", enSegment, true, true);
    expect(i18n.t("stats.leaderboardCount", { ns: "segment", lng: "en", count: 1 })).toBe("Leaderboard (1 rider)");
    expect(i18n.t("stats.leaderboardCount", { ns: "segment", lng: "en", count: 2 })).toBe("Leaderboard (2 riders)");
  });
  it("labels KOM measurements without rounding their original power", async () => {
    setDocData("segments/seg-1", { name: "Labeled KOM", distance: 1000, averageGrade: 0, maximumGrade: 0, elevationHigh: 1, elevationLow: 0 });
    setCollectionDocs("segment_efforts/seg-1/efforts", [{ id: "kom", segmentId: "seg-1", activityId: "recorded-kom", userId: "rider", nickname: "Best rider", elapsedTime: 97000, averageSpeed: 37.1, averageWatts: 260.1, startDate: 1700000000000 }]);
    renderWithProviders(<SegmentPage />, { route: "/ko/segment/seg-1" });
    await screen.findByText("Labeled KOM");
    fireEvent.click(screen.getByRole("tab", { name: "순위" }));
    const summary = within(await screen.findByTestId("D3-2"));
    expect(await summary.findByText(/37\.1 km\/h/)).toHaveTextContent("평균속도");
    expect(summary.getByText(/260\.1 W/)).toHaveTextContent("평균파워");
  });
  it.each([false, true])("gates write-prone route resolution only in the explicit Stage cached entry=%s", async cached => {
    cachedComparisonMocks.getStreams.mockClear();
    resetRuntimeConfigForTests({ appEnvironment: "stage", activityAnalysisExpansionEnabled: false });
    setDocData("segments/seg-1", { name: "Cached route", source: "strava", stravaSegmentId: 7, distance: 1000, averageGrade: 0, maximumGrade: 0, climbCategory: 0 });
    setCollectionDocs("segment_efforts/seg-1/efforts", [{ id: "e", segmentId: "seg-1", activityId: "strava_42", userId: "test-uid", nickname: "Owner", elapsedTime: 60000, averageSpeed: 20 }]);
    renderWithProviders(<SegmentPage />, { authenticated: true, profile: { stravaConnected: true }, route: `/ko/segment/seg-1${cached ? "?cachedComparison=1" : ""}` });
    await screen.findByText("Cached route");
    if (cached) fireEvent.click(screen.getByRole("tab", { name: "순위" }));
    if (cached) { await waitFor(() => expect(screen.getAllByText("Owner").length).toBeGreaterThan(0)); expect(cachedComparisonMocks.getStreams).not.toHaveBeenCalled(); }
    else await waitFor(() => expect(cachedComparisonMocks.getStreams).toHaveBeenCalledExactlyOnceWith(42));
    expect(mockCallableInvocations.some(c => c.name === "getActivityStreams" && (c.data as { mode?: string }).mode === "segment_distance_time_gap")).toBe(false);
  });
  it("lazily bounds owner history and excludes deleted source activities while API is preparing", async () => {
    vi.mocked(limit).mockClear();
    setDocData("segments/seg-1", { name: "History segment", distance: 1000, averageGrade: 0, maximumGrade: 0, elevationHigh: 1, elevationLow: 0 });
    setDocData("activities/a-live", { userId: "test-uid" });
    setDocData("activities/a-deleted", { userId: "test-uid", deletedAt: 1 });
    setCollectionDocs("segment_efforts/seg-1/efforts", [
      { id: "live", segmentId: "seg-1", activityId: "a-live", userId: "test-uid", nickname: "Owner", elapsedTime: 60000, averageSpeed: 20, startDate: 1700000000000 },
      { id: "deleted", segmentId: "seg-1", activityId: "a-deleted", userId: "test-uid", nickname: "Owner", elapsedTime: 420000, averageSpeed: 20, startDate: 1700000000000 },
    ]);
    renderWithProviders(<SegmentPage />, { authenticated: true });
    await screen.findByRole("tab", { name: koSegment.myRecord });
    fireEvent.click(screen.getByRole("tab", { name: koSegment.myRecord }));
    const toggle = await screen.findByRole("button", { name: koSegment.myHistory });
    expect(limit).not.toHaveBeenCalledWith(50);
    fireEvent.click(toggle);
    const preparing = await screen.findByText(koSegment["history.preparing"]);
    const panel = within(preparing.parentElement!);
    await waitFor(() => expect(panel.getByText("1:00")).toBeInTheDocument());
    expect(limit).toHaveBeenCalledWith(50);
    expect(panel.queryByText("7:00")).not.toBeInTheDocument();
    expect(panel.queryByRole("button", { name: koSegment["history.select"] })).not.toBeInTheDocument();
  });

  it.each([false, true])("opens explicit history with expansion enabled=%s", async enabled => {
    resetRuntimeConfigForTests({ activityAnalysisExpansionEnabled: enabled });
    setDocData("segments/seg-1", { name: "Context segment", distance: 1000, averageGrade: 0, maximumGrade: 0, elevationHigh: 1, elevationLow: 0 });
    setDocData("activities/a", { userId: "test-uid" });
    setCollectionDocs("segment_efforts/seg-1/efforts", [{ id: "e", segmentId: "seg-1", activityId: "a", userId: "test-uid", nickname: "Owner", elapsedTime: 60000, averageSpeed: 20, averageWatts: 100, startDate: 1700000000000 }]);
    renderWithProviders(<SegmentPage />, { authenticated: true, route: "/ko/segment/seg-1?currentActivityId=a&currentEffortId=e" });
    if (enabled) {
      await waitFor(() => expect(mockCallableInvocations.some(call => call.name === "getMySegmentHistory")).toBe(true));
      return;
    }
    expect(await screen.findByText(koSegment["history.preparing"])).toBeInTheDocument();
    expect(mockCallableInvocations.filter(call => call.name === "getMySegmentHistory")).toHaveLength(0);
    expect(screen.getByRole("button", { name: koSegment.myHistory })).toHaveAttribute("aria-expanded", "true");
    const panel = within(screen.getByText(koSegment["history.preparing"]).parentElement!);
    expect(await panel.findByText(`${koSegment["kom.avgSpeed"]} 20.0 km/h`)).toBeInTheDocument();
    expect(panel.getByRole("button", { name: "파워 설명" }).closest("div")).toHaveTextContent(`${koSegment["kom.power"]} 100 W`);
    expect(panel.getByText(koSegment["history.elapsedFormat"])).toBeInTheDocument();
  });
  it("shows loading state initially", () => {
    renderWithProviders(<SegmentPage />);
    const content = document.body.textContent ?? "";
    // Should show loading or empty state
    expect(content.length).toBeGreaterThan(0);
  });

  it("renders segment details when data is loaded", async () => {
    setDocData("segments/seg-1", {
      id: "seg-1",
      name: "남산 업힐",
      distance: 2500,
      averageGrade: 7.2,
      maximumGrade: 12.0,
      elevationHigh: 260,
      elevationLow: 80,
      climbCategory: 3,
    });

    renderWithProviders(<SegmentPage />);

    await waitFor(() => {
      expect(screen.getByText("남산 업힐")).toBeInTheDocument();
    });
  });

  it("shows segment stats", async () => {
    setDocData("segments/seg-1", {
      id: "seg-1",
      name: "테스트 세그먼트",
      distance: 3000,
      averageGrade: 5.5,
      maximumGrade: 10.0,
      elevationHigh: 200,
      elevationLow: 50,
      climbCategory: 2,
    });

    renderWithProviders(<SegmentPage />);

    await waitFor(() => {
      expect(screen.getByText("테스트 세그먼트")).toBeInTheDocument();
    });
  });

  it("falls back instead of crashing when segmentLatlng is invalid JSON", async () => {
    setDocData("segments/seg-1", {
      id: "seg-1",
      name: "손상된 좌표 세그먼트",
      distance: 3000,
      averageGrade: 5.5,
      maximumGrade: 10.0,
      elevationHigh: 200,
      elevationLow: 50,
      climbCategory: 2,
      segmentLatlng: "[invalid",
      startLatlng: [37.1, 127.1],
      endLatlng: [37.2, 127.2],
    });

    renderWithProviders(<SegmentPage />);

    await waitFor(() => {
      expect(screen.getByText("손상된 좌표 세그먼트")).toBeInTheDocument();
    });
  });

  it("shows segment average speed from distance and elapsed time instead of stored moving speed", async () => {
    setDocData("segments/seg-1", {
      id: "seg-1",
      name: "리더보드 세그먼트",
      distance: 2000,
      averageGrade: 6.0,
      maximumGrade: 9.0,
      elevationHigh: 180,
      elevationLow: 60,
      climbCategory: 3,
    });

    setCollectionDocs("segment_efforts/seg-1/efforts", [
      {
        id: "e1",
        segmentId: "seg-1",
        activityId: "a1",
        userId: "u1",
        nickname: "1등 라이더",
        elapsedTime: 300000,
        movingTime: 240000,
        averageSpeed: 30.0,
        averageWatts: 280,
        averageHeartrate: 170,
        maxHeartrate: 185,
        averageCadence: 90,
        recordedAt: Date.now() - 86400000,
      },
    ]);

    renderWithProviders(<SegmentPage />);

    await waitFor(() => {
      expect(screen.getByText("리더보드 세그먼트")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("tab", { name: "순위" }));
    expect(screen.getByRole("columnheader", { name: "구간 평균속도" })).toBeInTheDocument();
    expect(enSegment["table.segmentAvgSpeed"]).toBe("Segment Avg Speed");
    fireEvent.click(screen.getByRole("tab", { name: "순위" }));
    const leaderboard = within(screen.getByRole("table"));
    expect(leaderboard.getByText("5:00")).toBeInTheDocument();
    expect(leaderboard.getByText("24.0 km/h")).toBeInTheDocument();
    expect(leaderboard.queryByText("30.0 km/h")).not.toBeInTheDocument();
  });

  it("keeps an effort with invalid canonical inputs and renders no segment average speed", async () => {
    setDocData("segments/seg-1", {
      id: "seg-1",
      name: "거리 미확인 세그먼트",
      distance: 0,
      averageGrade: 0,
      maximumGrade: 0,
      elevationHigh: 0,
      elevationLow: 0,
      climbCategory: 0,
    });
    setCollectionDocs("segment_efforts/seg-1/efforts", [
      {
        id: "e-invalid",
        segmentId: "seg-1",
        activityId: "a-invalid",
        userId: "u-invalid",
        nickname: "계산 불가 라이더",
        elapsedTime: 300000,
        movingTime: 240000,
        averageSpeed: 30,
        recordedAt: Date.now(),
      },
    ]);

    renderWithProviders(<SegmentPage />);

    await waitFor(() => {
      expect(screen.getByText("거리 미확인 세그먼트")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("tab", { name: "순위" }));
    const leaderboard = within(screen.getByRole("table"));
    expect(screen.getByText("리더보드 (1명)")).toBeInTheDocument();
    expect(leaderboard.getByText("— km/h")).toBeInTheDocument();
    expect(leaderboard.queryByText("0.0 km/h")).not.toBeInTheDocument();
  });

  it("queries used-by courses with the deployed deletedAt composite index shape", async () => {
    vi.mocked(where).mockClear();
    setDocData("segments/seg-1", {
      id: "seg-1",
      name: "코스 역링크 세그먼트",
      distance: 3000,
      averageGrade: 5.5,
      maximumGrade: 10.0,
      elevationHigh: 200,
      elevationLow: 50,
      climbCategory: 2,
    });
    setCollectionDocs("courses", [
      { id: "course-1", name: "남산 코스", segmentIds: ["seg-1"], deletedAt: null, createdAt: 2 },
    ]);

    renderWithProviders(<SegmentPage />);

    await waitFor(() => {
      expect(screen.getByText("코스 역링크 세그먼트")).toBeInTheDocument();
    });
    expect(where).toHaveBeenCalledWith("segmentIds", "array-contains", "seg-1");
    expect(where).toHaveBeenCalledWith("deletedAt", "==", null);
  });
});
