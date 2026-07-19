import { screen, waitFor, within } from "@testing-library/react";
import { where } from "firebase/firestore";
import SegmentPage from "./SegmentPage";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { setDocData, setCollectionDocs } from "../__tests__/mocks/firebase";
import enSegment from "../i18n/resources/en/segment.json";

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
    expect(screen.getByRole("columnheader", { name: "구간 평속" })).toBeInTheDocument();
    expect(enSegment["table.segmentAvgSpeed"]).toBe("Segment Avg Speed");
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
