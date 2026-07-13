import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { setCollectionDocs } from "../__tests__/mocks/firebase";
import FitnessPage from "./FitnessPage";

const viewport = vi.hoisted(() => ({ isMobile: true }));

vi.mock("../hooks/useMobile", () => ({
  useMobile: () => viewport.isMobile,
}));

vi.mock("../components/mobile/MobileFitnessPage", () => ({
  default: ({ data }: { data: { discipline: string } }) => (
    <div>mobile fitness dashboard: {data.discipline}</div>
  ),
}));

vi.mock("./fitness/TriFitnessView", () => ({
  default: () => <div>desktop tri fitness dashboard</div>,
}));

describe("FitnessPage", () => {
  beforeEach(() => {
    viewport.isMobile = true;
  });

  it("shows the guest demo instead of the mobile dashboard for signed-out mobile visitors", async () => {
    renderWithProviders(<FitnessPage />, {
      authenticated: false,
      route: "/fitness",
    });

    expect(await screen.findByText("피트니스 곡선 미리보기")).toBeInTheDocument();
    expect(screen.getByText("데모 데이터")).toBeInTheDocument();
    expect(screen.queryByText("mobile fitness dashboard")).not.toBeInTheDocument();
  });

  it("renders the mobile dashboard for an authenticated tri athlete on mobile", async () => {
    setCollectionDocs("activities", [{
      id: "tri-ride",
      userId: "test-uid",
      type: "Ride",
      startTime: Date.now(),
      deletedAt: null,
      summary: { distance: 20_000, ridingTimeMillis: 3_600_000 },
    }]);

    renderWithProviders(<FitnessPage />, {
      authenticated: true,
      route: "/fitness?sport=tri",
    });

    expect(await screen.findByText("mobile fitness dashboard: tri")).toBeInTheDocument();
    expect(screen.queryByText("desktop tri fitness dashboard")).not.toBeInTheDocument();
  });

  it("keeps the dedicated tri dashboard on desktop", async () => {
    viewport.isMobile = false;

    renderWithProviders(<FitnessPage />, {
      authenticated: true,
      route: "/fitness?sport=tri",
    });

    expect(await screen.findByText("desktop tri fitness dashboard")).toBeInTheDocument();
    expect(screen.queryByText("mobile fitness dashboard: tri")).not.toBeInTheDocument();
  });
});
