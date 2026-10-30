import i18n from "i18next";
import { splitGlossaryText } from "../utils/termGlossary";
import { resetRuntimeConfigForTests } from "../services/runtimeConfig";
import { screen, waitFor, within, fireEvent } from "@testing-library/react";
import { where } from "firebase/firestore";
import SegmentPage from "./SegmentPage";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { setDocData, setCollectionDocs, setCallableResult, setCallableImplementation, mockDocData, mockCallableInvocations } from "../__tests__/mocks/firebase";
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
  beforeEach(() => {
    resetRuntimeConfigForTests({ activityAnalysisExpansionEnabled: false });
    setCallableImplementation("getPublicSegmentMetadata", (request) => ({ data: { items: (request as { ids: string[] }).ids.flatMap(id => mockDocData.has(`segments/${id}`) ? [{ id, ...mockDocData.get(`segments/${id}`) }] : []), cursor: null, hasMore: false } }));
  });
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
  it("requires a verified callable instead of reading public efforts or sampling Strava streams", async () => {
    setDocData("segments/seg-1", { name: "Private legacy", distance: 1000 });
    setCollectionDocs("segment_efforts/seg-1/efforts", [{ id: "hidden", nickname: "Hidden rider" }]);
    renderWithProviders(<SegmentPage />, { authenticated: true });
    await screen.findByText("Private legacy");
    fireEvent.click(screen.getByRole("tab", { name: "순위" }));
    expect(screen.getByText(koSegment["nativeBoard.title"])).toBeInTheDocument();
    expect(screen.queryByText("Hidden rider")).not.toBeInTheDocument();
    expect(cachedComparisonMocks.getStreams).not.toHaveBeenCalled();
  });
  it("lazily bounds owner history and excludes deleted source activities while API is preparing", async () => {

    setDocData("segments/seg-1", { name: "History segment", distance: 1000, averageGrade: 0, maximumGrade: 0, elevationHigh: 1, elevationLow: 0 });
    setDocData("activities/a-live", { userId: "test-uid" });
    setDocData("activities/a-deleted", { userId: "test-uid", deletedAt: 1 });
    setCollectionDocs("segment_efforts/seg-1/efforts", [
      { id: "live", segmentId: "seg-1", activityId: "a-live", userId: "test-uid", nickname: "Owner", elapsedTime: 60000, averageSpeed: 20, startDate: 1700000000000 },
      { id: "deleted", segmentId: "seg-1", activityId: "a-deleted", userId: "test-uid", nickname: "Owner", elapsedTime: 420000, averageSpeed: 20, startDate: 1700000000000 },
    ]);
    setCallableResult("getMySegmentAttempts", { data: { entries: [{ id: "live", segmentId: "seg-1", activityId: "a-live", userId: "test-uid", nickname: "Owner", profileImage: null, elapsedTime: 60000, averageSpeed: 20, startDate: 1700000000000, averageWatts: null, averageHeartrate: null }] } });
    renderWithProviders(<SegmentPage />, { authenticated: true });
    await screen.findByRole("tab", { name: koSegment.myRecord });
    fireEvent.click(screen.getByRole("tab", { name: koSegment.myRecord }));
    const toggle = await screen.findByRole("button", { name: koSegment.myHistory });
    expect(mockCallableInvocations.some(c => c.name === "getMySegmentAttempts")).toBe(false);
    fireEvent.click(toggle);
    const preparing = await screen.findByText(koSegment["history.preparing"]);
    const panel = within(preparing.parentElement!);
    await waitFor(() => expect(panel.getByText("1:00")).toBeInTheDocument());
    expect(mockCallableInvocations.some(c => c.name === "getMySegmentAttempts")).toBe(true);
    expect(panel.queryByText("7:00")).not.toBeInTheDocument();
    expect(panel.queryByRole("button", { name: koSegment["history.select"] })).not.toBeInTheDocument();
  });

  it.each([false, true])("opens explicit history with expansion enabled=%s", async enabled => {
    resetRuntimeConfigForTests({ activityAnalysisExpansionEnabled: enabled });
    setDocData("segments/seg-1", { name: "Context segment", distance: 1000, averageGrade: 0, maximumGrade: 0, elevationHigh: 1, elevationLow: 0 });
    setDocData("activities/a", { userId: "test-uid" });
    setCollectionDocs("segment_efforts/seg-1/efforts", [{ id: "e", segmentId: "seg-1", activityId: "a", userId: "test-uid", nickname: "Owner", elapsedTime: 60000, averageSpeed: 20, averageWatts: 100, startDate: 1700000000000 }]);
    setCallableResult("getMySegmentAttempts", { data: { entries: [{ id: "e", segmentId: "seg-1", activityId: "a", userId: "test-uid", nickname: "Owner", profileImage: null, elapsedTime: 60000, averageSpeed: 20, startDate: 1700000000000, averageWatts: 100, averageHeartrate: null }] } });
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
  it("shows unavailable metadata without rendering a leaderboard", async () => {
    renderWithProviders(<SegmentPage />);
    expect(await screen.findByText(koSegment["error.notFound"])).toBeInTheDocument();
    expect(screen.queryByText(koSegment["nativeBoard.title"])).not.toBeInTheDocument();
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
