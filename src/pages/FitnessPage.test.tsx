import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { setCollectionDocs, setDocData } from "../__tests__/mocks/firebase";
import FitnessPage from "./FitnessPage";

const viewport = vi.hoisted(() => ({ isMobile: true }));

vi.mock("../hooks/useMobile", () => ({
  useMobile: () => viewport.isMobile,
}));

vi.mock("../components/mobile/MobileFitnessPage", () => ({
  default: ({ data }: { data: { discipline: string; ctl: number; atl: number; tsb: number; combinedLoad?: { ctl: number; contributions: unknown[] } | null; loadFocus: { totalLoad: number } } }) => (
    <div>
      mobile fitness dashboard: {data.discipline}
      <span>selected {data.ctl}/{data.atl}/{data.tsb}</span>
      <span>integrated {data.combinedLoad?.ctl ?? "none"}</span>
      <span>contributions {data.combinedLoad?.contributions.length ?? 0}</span>
      <span>focus {data.loadFocus.totalLoad}</span>
    </div>
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

  it("passes authoritative combined load to a single-sport mobile tab", async () => {
    const now = Date.now();
    setCollectionDocs("activities", [{
      id: "run-1",
      userId: "test-uid",
      type: "Run",
      startTime: now,
      deletedAt: null,
      summary: { distance: 5_000, ridingTimeMillis: 1_800_000, tss: 40, relativeEffort: null },
    }]);
    setDocData("users/test-uid/fitness/current", {
      updatedAt: now,
      totalCTL: 48,
      totalATL: 51,
      totalTSB: -3,
      breakdown: {
        bike: { ctl: 30, atl: 30, tsb: 0, weeklyTSS: 200 },
        run: { ctl: 15, atl: 18, tsb: -3, weeklyTSS: 100 },
        swim: { ctl: 3, atl: 3, tsb: 0, weeklyTSS: 20 },
      },
      thresholds: { bike: { ftp: 250 }, run: { thresholdPace: 285 }, swim: { css: 95 } },
    });
    setDocData("users/test-uid/fitness/timeseries_run", {
      discipline: "run",
      schemaVersion: 1,
      computedAt: now,
      startDate: "2026-07-14",
      endDate: "2026-07-14",
      pointCount: 1,
      points: [{ date: "2026-07-14", ctl: 12, atl: 14, tsb: -2, dailyLoad: 40 }],
    });

    renderWithProviders(<FitnessPage />, { authenticated: true, route: "/fitness?sport=run" });

    expect(await screen.findByText("mobile fitness dashboard: run")).toBeInTheDocument();
    expect(screen.getByText("selected 12/14/-2")).toBeInTheDocument();
    expect(screen.getByText("integrated 48")).toBeInTheDocument();
    expect(screen.getByText("contributions 3")).toBeInTheDocument();
    expect(screen.getByText("focus 40")).toBeInTheDocument();
  });
});
