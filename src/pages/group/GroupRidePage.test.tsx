import { screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setCollectionDocs, setDocData } from "../../__tests__/mocks/firebase";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { getActivityStreams } from "../../services/personalDataApi";
import GroupRidePage from "./GroupRidePage";

vi.mock("../../services/personalDataApi", () => ({
  getActivityStreams: vi.fn(),
}));

vi.mock("../../hooks/useGroup", () => ({
  useGroup: () => ({ group: null, loading: false }),
}));

vi.mock("react-map-gl/mapbox", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="ride-map">{children}</div>,
  Source: ({ children }: { children: React.ReactNode }) => <div data-testid="ride-route">{children}</div>,
  Layer: () => null,
  Marker: () => null,
}));

vi.mock("../../components/ElevationChart", () => ({
  default: () => <div data-testid="elevation-chart" />,
}));

describe("GroupRidePage streams", () => {
  beforeEach(() => {
    vi.mocked(getActivityStreams).mockReset();
    setCollectionDocs("activities", [{
      id: "native-gcs",
      userId: "test-uid",
      source: "orider",
      groupRideId: "ride-1",
      startTime: Date.now(),
      nickname: "Rider",
      visibility: "everyone",
      deletedAt: null,
      summary: { distance: 1000, averageSpeed: 20 },
    }]);
  });

  it("renders a native route stored in GCS", async () => {
    setDocData("activity_streams/native-gcs", {
      storage: "gcs",
      gcsPath: "activity-streams/native-gcs.json",
    });
    vi.mocked(getActivityStreams).mockResolvedValue({
      latlng: [[37.5, 127.0], [37.6, 127.1]],
      altitude: [20, 25],
      distance: [0, 1000],
    });

    renderWithProviders(
      <Routes>
        <Route path="/ko/group/:groupId/rides/:rideId" element={<GroupRidePage />} />
      </Routes>,
      { route: "/ko/group/group-1/rides/ride-1", authenticated: true },
    );

    await waitFor(() => expect(getActivityStreams).toHaveBeenCalledExactlyOnceWith("native-gcs"));
    expect(await screen.findByTestId("ride-route")).toBeInTheDocument();
    expect(screen.getByTestId("elevation-chart")).toBeInTheDocument();
  });
});
