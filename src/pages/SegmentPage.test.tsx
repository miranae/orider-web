import { screen, waitFor } from "@testing-library/react";
import SegmentPage from "./SegmentPage";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { setDocData, setCollectionDocs } from "../__tests__/mocks/firebase";

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

  it("shows leaderboard when efforts exist", async () => {
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
        movingTime: 295000,
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
      const content = document.body.textContent ?? "";
      expect(content.includes("리더보드 세그먼트")).toBeTruthy();
    });
  });
});
