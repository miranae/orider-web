import { fireEvent, screen, waitFor } from "@testing-library/react";
import { getDoc, onSnapshot } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { setCollectionDocs, setDocData } from "../__tests__/mocks/firebase";
import parity from "../features/coach/__fixtures__/rider-insight-parity.json";
import { parseCoachRiderInsight } from "../services/coachRiderInsightContract";
import FitnessSurface from "../embedded/surfaces/FitnessSurface";
import { normalizeFitnessRange } from "../hooks/useFitnessModel";
import FitnessPage from "./FitnessPage";

const viewport = vi.hoisted(() => ({ isMobile: true }));
const riderInsight = vi.hoisted(() => ({ enabled: false, insight: null as ReturnType<typeof parseCoachRiderInsight> | null, loading: false, unavailable: false }));

vi.mock("../hooks/useMobile", () => ({
  useMobile: () => viewport.isMobile,
}));
vi.mock("../services/runtimeConfig", () => ({ getRuntimeConfig: () => ({ coachRiderInsightEnabled: riderInsight.enabled }) }));
vi.mock("../hooks/useCoachRiderInsight", () => ({ useCoachRiderInsight: () => riderInsight }));
vi.mock("../features/trainingDecision/TodayTrainingDecisionCard", () => ({
  default: ({ surface }: { surface: string }) => <div data-testid="today-training-decision">{surface} workout</div>,
}));

vi.mock("../components/mobile/MobileFitnessPage", () => ({
  default: ({ data, coachSlot }: { data: { discipline: string; ctl: number; atl: number; tsb: number; combinedLoad?: { ctl: number; contributions: unknown[] } | null; loadFocus: { totalLoad: number }; cyclingAbility?: { activityCount: number; axes: Array<{ score: number | null }> } | null; pdcSummary?: { riderType?: { type: string } | null; abilityScore?: number | null; activityCount?: number | null } | null }; coachSlot?: ReactNode }) => (
    <div>
      {coachSlot}
      mobile fitness dashboard: {data.discipline}
      <span>selected {data.ctl}/{data.atl}/{data.tsb}</span>
      <span>integrated {data.combinedLoad?.ctl ?? "none"}</span>
      <span>contributions {data.combinedLoad?.contributions.length ?? 0}</span>
      <span>focus {data.loadFocus.totalLoad}</span>
      <span>cycling ability {data.cyclingAbility?.activityCount ?? "none"}/{data.cyclingAbility?.axes[0]?.score ?? "none"}</span>
      <span>PDC summary {data.pdcSummary?.abilityScore ?? "none"}/{data.pdcSummary?.activityCount ?? "none"}/{data.pdcSummary?.riderType?.type ?? "none"}</span>
    </div>
  ),
}));
vi.mock("./fitness/TriFitnessView", () => ({
  default: ({ combinedLoad, loadFocus, breakdown, onRangeChange }: {
    combinedLoad?: { ctl: number } | null;
    loadFocus: { totalLoad: number };
    breakdown: {
      bike: { weeklyTSS: number; fitness: Array<{ ctl: number }> };
      run: { weeklyTSS: number; fitness: Array<{ ctl: number }> };
    };
    onRangeChange: (range: 365) => void;
  }) => (
    <div>
      desktop tri fitness dashboard
      <span>desktop integrated {combinedLoad?.ctl ?? "none"}</span>
      <span>desktop focus {loadFocus.totalLoad}</span>
      <span>desktop bike {breakdown.bike.fitness[breakdown.bike.fitness.length - 1]?.ctl ?? "none"}/{breakdown.bike.weeklyTSS}</span>
      <span>desktop run {breakdown.run.fitness[breakdown.run.fitness.length - 1]?.ctl ?? "none"}/{breakdown.run.weeklyTSS}</span>
      <button onClick={() => onRangeChange(365)}>desktop 1y</button>
    </div>
  ),
}));

describe("FitnessPage", () => {
  beforeEach(() => {
    viewport.isMobile = true;
    riderInsight.enabled = false;
    riderInsight.insight = null;
    riderInsight.loading = false;
    riderInsight.unavailable = false;
  });

  it("never carries a single-sport projection into the integrated mobile PMC", () => {
    const source = readFileSync(join(process.cwd(), "src/hooks/useFitnessModel.ts"), "utf8");
    expect(source).toContain('pmcProjection: discipline === "tri" ? null : projection?.series ?? null');
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

  it.each([
    ["mobile", <FitnessPage />],
    ["embedded", <FitnessSurface onError={vi.fn()} onReady={vi.fn()} retryKey={0} />],
  ])("uses the integrated tri timeline on the %s presentation", async (_surface, view) => {
    setCollectionDocs("activities", [{
      id: "tri-activity",
      userId: "test-uid",
      type: "Ride",
      startTime: Date.now(),
      deletedAt: null,
      summary: { distance: 20_000, ridingTimeMillis: 3_600_000 },
    }]);
    for (const [discipline, ctl, atl] of [
      ["bike", 30, 28],
      ["run", 15, 14],
      ["swim", 3, 2],
    ] as const) {
      setDocData(`users/test-uid/fitness/timeseries_${discipline}`, {
        discipline,
        schemaVersion: 1,
        computedAt: Date.now(),
        startDate: "2026-09-02",
        endDate: "2026-09-02",
        pointCount: 1,
        points: [{ date: "2026-09-02", ctl, atl, tsb: ctl - atl, dailyLoad: 0 }],
      });
    }

    renderWithProviders(view, {
      authenticated: true,
      route: "/fitness?sport=tri",
    });

    expect(await screen.findByText("selected 48/44/4")).toBeInTheDocument();
    expect(screen.getByText("integrated 48")).toBeInTheDocument();
  });

  it("puts the activity impact briefing on a single-sport mobile overview", async () => {
    setCollectionDocs("activities", [{
      id: "mobile-ride",
      userId: "test-uid",
      type: "Ride",
      startTime: Date.parse("2026-08-29T08:00:00.000Z"),
      deletedAt: null,
      summary: { distance: 70_400, ridingTimeMillis: 9_385_000, tss: 102, relativeEffort: null },
    }]);
    setDocData("users/test-uid/fitness/timeseries_bike", {
      discipline: "bike",
      schemaVersion: 1,
      computedAt: Date.now(),
      startDate: "2026-08-28",
      endDate: "2026-08-29",
      pointCount: 2,
      points: [
        { date: "2026-08-28", ctl: 36, atl: 42, tsb: -6, dailyLoad: 0 },
        { date: "2026-08-29", ctl: 37.9, atl: 48.5, tsb: -10.6, dailyLoad: 102 },
      ],
    });

    renderWithProviders(<FitnessPage />, { authenticated: true, route: "/fitness?sport=bike" });

    expect(await screen.findByText("반영 부하 102 TSS")).toBeInTheDocument();
    expect(screen.getByText("mobile fitness dashboard: bike")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /회복 라이딩/ })).toBeInTheDocument();
  });

  it.each([true, false])("keeps today's workout available when fitness data fails (mobile=%s)", async (isMobile) => {
    viewport.isMobile = isMobile;
    const snapshotMock = vi.mocked(onSnapshot);
    const originalImplementation = snapshotMock.getMockImplementation()!;
    snapshotMock.mockImplementation(((ref: { path?: string }, onNext: unknown, onError: unknown, optionsError: unknown) => {
      if (ref.path === "activities" && typeof onError === "function") {
        onError(new Error("fitness unavailable"));
        return vi.fn();
      }
      return originalImplementation(ref, onNext, onError, optionsError);
    }) as never);

    try {
      renderWithProviders(<FitnessPage />, { authenticated: true, route: "/fitness?sport=bike" });

      expect(await screen.findByTestId("today-training-decision")).toHaveTextContent("fitness workout");
      expect(screen.getByText("피트니스 데이터를 불러오지 못했습니다")).toBeInTheDocument();
    } finally {
      snapshotMock.mockImplementation(originalImplementation);
    }
  });

  it("attempts missing stream and metrics documents only once until activity lifecycle changes", async () => {
    const baseActivity = {
      id: "pending-analysis",
      userId: "test-uid",
      type: "Ride",
      startTime: Date.now(),
      deletedAt: null,
      summary: { distance: 20_000, ridingTimeMillis: 3_600_000, averagePower: 180 },
    };
    setCollectionDocs("activities", [baseActivity]);

    renderWithProviders(<FitnessPage />, { authenticated: true, route: "/fitness?sport=bike" });

    const readsFor = (path: string) => vi.mocked(getDoc).mock.calls
      .filter(([ref]) => (ref as { path?: string }).path === path).length;
    await waitFor(() => {
      expect(readsFor("activity_streams/pending-analysis")).toBe(1);
      expect(readsFor("activity_metrics/pending-analysis")).toBe(1);
    });

    setCollectionDocs("activities", [{ ...baseActivity }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(readsFor("activity_streams/pending-analysis")).toBe(1);
    expect(readsFor("activity_metrics/pending-analysis")).toBe(1);

    setDocData("activity_streams/pending-analysis", { watts: [180, 190] });
    setDocData("activity_metrics/pending-analysis", { tss: 45 });
    setCollectionDocs("activities", [{
      ...baseActivity,
      summary: { ...baseActivity.summary, movingTimeSec: 3_500 },
    }]);

    await waitFor(() => {
      expect(readsFor("activity_streams/pending-analysis")).toBe(2);
      expect(readsFor("activity_metrics/pending-analysis")).toBe(2);
    });
  });

  it("keeps the dedicated tri dashboard on desktop", async () => {
    viewport.isMobile = false;
    setDocData("users/test-uid/fitness/current", {
      updatedAt: Date.now(), totalCTL: 48, totalATL: 51, totalTSB: -3,
      breakdown: { bike: { ctl: 30 }, run: { ctl: 15 }, swim: { ctl: 3 } },
    });
    for (const [discipline, ctl] of [["bike", 30], ["run", 15], ["swim", 3]] as const) {
      setDocData(`users/test-uid/fitness/timeseries_${discipline}`, {
        discipline,
        schemaVersion: 1,
        computedAt: Date.now(),
        startDate: "2026-09-02",
        endDate: "2026-09-02",
        pointCount: 1,
        points: [{ date: "2026-09-02", ctl, atl: ctl, tsb: 0, dailyLoad: 0 }],
      });
    }

    renderWithProviders(<FitnessPage />, {
      authenticated: true,
      route: "/fitness?sport=tri",
    });

    expect(await screen.findByText("desktop tri fitness dashboard")).toBeInTheDocument();
    expect(screen.getByText("desktop integrated 48")).toBeInTheDocument();
    expect(screen.queryByText("mobile fitness dashboard: tri")).not.toBeInTheDocument();
  });

  it("prefers canonical discipline timeseries and uses activity_metrics.tss for a missing discipline fallback", async () => {
    viewport.isMobile = false;
    setCollectionDocs("activities", [{
      id: "run-fallback",
      userId: "test-uid",
      type: "Run",
      startTime: Date.now(),
      deletedAt: null,
      summary: { distance: 10_000, ridingTimeMillis: 3_600_000, relativeEffort: null },
    }]);
    setDocData("activity_metrics/run-fallback", { tss: 72, discipline: "run" });
    setDocData("users/test-uid/fitness/timeseries_run", {
      discipline: "run",
      schemaVersion: 1,
      computedAt: Date.now(),
      startDate: "2026-09-02",
      endDate: "2026-09-02",
      pointCount: 1,
      points: [null],
    });
    setDocData("users/test-uid/fitness/timeseries_bike", {
      discipline: "bike",
      schemaVersion: 1,
      computedAt: Date.now(),
      startDate: "2026-09-01",
      endDate: "2026-09-02",
      pointCount: 2,
      points: [
        { date: "2026-09-01", ctl: 34, atl: 28, tsb: 6, dailyLoad: 0 },
        { date: "2026-09-02", ctl: 35.2, atl: 30.5, tsb: 4.7, dailyLoad: 40 },
      ],
    });

    renderWithProviders(<FitnessPage />, { authenticated: true, route: "/fitness?sport=tri" });

    expect(await screen.findByText("desktop bike 35.2/40")).toBeInTheDocument();
    expect(await screen.findByText(/desktop run [^/]+\/72/)).toBeInTheDocument();
  });

  it("aligns discipline weekly TSS to the shared final seven-day window", async () => {
    viewport.isMobile = false;
    setDocData("users/test-uid/fitness/timeseries_bike", {
      discipline: "bike",
      schemaVersion: 1,
      computedAt: Date.now(),
      startDate: "2026-09-01",
      endDate: "2026-09-01",
      pointCount: 1,
      points: [{ date: "2026-09-01", ctl: 35, atl: 30, tsb: 5, dailyLoad: 40 }],
    });
    setDocData("users/test-uid/fitness/timeseries_run", {
      discipline: "run",
      schemaVersion: 1,
      computedAt: Date.now(),
      startDate: "2026-09-10",
      endDate: "2026-09-10",
      pointCount: 1,
      points: [{ date: "2026-09-10", ctl: 8, atl: 7, tsb: 1, dailyLoad: 72 }],
    });
    setDocData("users/test-uid/fitness/timeseries_swim", {
      discipline: "swim",
      schemaVersion: 1,
      computedAt: Date.now(),
      startDate: null,
      endDate: null,
      pointCount: 0,
      points: [],
    });

    renderWithProviders(<FitnessPage />, { authenticated: true, route: "/fitness?sport=tri" });

    expect(await screen.findByText(/desktop bike [^/]+\/0/)).toBeInTheDocument();
    expect(screen.getByText("desktop run 8/72")).toBeInTheDocument();
  });

  it("updates the parent tri range without re-subscribing the stable fallback query", async () => {
    viewport.isMobile = false;
    renderWithProviders(<FitnessPage />, { authenticated: true, route: "/fitness?sport=tri" });
    await screen.findByText("desktop tri fitness dashboard");
    const activitySubscriptions = () => vi.mocked(onSnapshot).mock.calls
      .filter(([ref]) => (ref as { path?: string }).path === "activities").length;
    const before = activitySubscriptions();

    fireEvent.click(screen.getByRole("button", { name: "desktop 1y" }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(activitySubscriptions()).toBe(before);
  });

  it("normalizes the tri-only 42-day range before a single-sport query", () => {
    expect(normalizeFitnessRange("tri", 30)).toBe(90);
    expect(normalizeFitnessRange("tri", 42)).toBe(42);
    expect(normalizeFitnessRange("bike", 42)).toBe(90);
    expect(normalizeFitnessRange("run", 180)).toBe(180);
  });

  it("keeps today's workout out of an empty single-sport desktop tab", async () => {
    viewport.isMobile = false;
    renderWithProviders(<FitnessPage />, { authenticated: true, route: "/fitness?sport=bike" });
    expect(await screen.findByText("피트니스 차트를 만들 활동이 아직 없어요")).toBeInTheDocument();
    expect(screen.queryByTestId("desktop-full-ai-coach")).not.toBeInTheDocument();
  });

  it("synchronizes recent activity selection with the PMC marker", async () => {
    viewport.isMobile = false;
    const activities = [
      {
        id: "ride-new",
        userId: "test-uid",
        type: "Ride",
        startTime: Date.parse("2026-08-29T08:00:00.000Z"),
        deletedAt: null,
        summary: { distance: 100_000, ridingTimeMillis: 10_800_000, tss: 196, relativeEffort: null },
      },
      {
        id: "ride-old",
        userId: "test-uid",
        type: "Ride",
        startTime: Date.parse("2026-08-28T08:00:00.000Z"),
        deletedAt: null,
        summary: { distance: 42_000, ridingTimeMillis: 5_400_000, tss: 84, relativeEffort: null },
      },
    ];
    setCollectionDocs("activities", activities);
    setDocData("users/test-uid/fitness/timeseries_bike", {
      discipline: "bike",
      schemaVersion: 1,
      computedAt: Date.now(),
      startDate: "2026-08-27",
      endDate: "2026-08-29",
      pointCount: 3,
      points: [
        { date: "2026-08-27", ctl: 36, atl: 42, tsb: -6, dailyLoad: 0 },
        { date: "2026-08-28", ctl: 37.1, atl: 48, tsb: -10.9, dailyLoad: 84 },
        { date: "2026-08-29", ctl: 40.8, atl: 69, tsb: -28.2, dailyLoad: 196 },
      ],
    });

    const { container } = renderWithProviders(<FitnessPage />, {
      authenticated: true,
      route: "/fitness?sport=bike",
    });

    expect(await screen.findByRole("heading", { name: /회복을 흡수하는 날/ })).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('[data-activity-marker="ride-new"] circle')).toHaveAttribute("r", "5"));

    fireEvent.click(screen.getByRole("button", { name: /42.0 km/ }));
    await waitFor(() => {
      expect(container.querySelector('[data-activity-marker="ride-old"] circle')).toHaveAttribute("r", "5");
      expect(container.querySelector('[data-activity-marker="ride-new"] circle')).toHaveAttribute("r", "3.5");
    });
  });

  it.each([
    {
      caseName: "production overlap",
      oriderStart: 1_787_990_769_446,
      oriderDistance: 77_781.36,
      oriderMovingSec: 11_735.672,
      stravaStart: 1_787_994_466_000,
      stravaDistance: 70_416.6,
      stravaMovingSec: 9_385,
    },
    {
      caseName: "later Orider document",
      oriderStart: Date.parse("2026-08-29T08:00:30.000Z"),
      oriderDistance: 77_800,
      oriderMovingSec: 8_900,
      stravaStart: Date.parse("2026-08-29T08:00:00.000Z"),
      stravaDistance: 70_400,
      stravaMovingSec: 8_700,
    },
  ])("does not show a physical duplicate as pending: $caseName", async ({
    oriderStart,
    oriderDistance,
    oriderMovingSec,
    stravaStart,
    stravaDistance,
    stravaMovingSec,
  }) => {
    viewport.isMobile = false;
    setCollectionDocs("activities", [
      {
        id: "orider-duplicate",
        userId: "test-uid",
        source: "orider",
        type: "Ride",
        startTime: oriderStart,
        deletedAt: null,
        summary: { distance: oriderDistance, movingTimeSec: oriderMovingSec, ridingTimeMillis: oriderMovingSec * 1_000, tss: 102 },
      },
      {
        id: "strava_representative",
        userId: "test-uid",
        source: "strava",
        type: "Ride",
        startTime: stravaStart,
        deletedAt: null,
        summary: { distance: stravaDistance, movingTimeSec: stravaMovingSec, ridingTimeMillis: stravaMovingSec * 1_000, tss: null },
      },
    ]);
    setDocData("users/test-uid/fitness/timeseries_bike", {
      discipline: "bike",
      schemaVersion: 1,
      computedAt: Date.now(),
      startDate: "2026-08-28",
      endDate: "2026-08-29",
      pointCount: 2,
      points: [
        { date: "2026-08-28", ctl: 36, atl: 42, tsb: -6, dailyLoad: 0 },
        { date: "2026-08-29", ctl: 37.9, atl: 48.5, tsb: -10.6, dailyLoad: 102 },
      ],
    });

    renderWithProviders(<FitnessPage />, { authenticated: true, route: "/fitness?sport=bike" });

    expect(await screen.findByText("반영 부하 102 TSS")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /70\.4 km/ })).toBeInTheDocument();
    expect(screen.queryByText("일일 부하 반영을 기다리는 중")).not.toBeInTheDocument();
  });

  it("does not show a newer negligible activity as pending over a canonical ride", async () => {
    viewport.isMobile = false;
    const rideStart = Date.parse("2026-09-03T08:00:00.000Z");
    setCollectionDocs("activities", [
      {
        id: "negligible-orider",
        userId: "test-uid",
        source: "orider",
        type: "Ride",
        startTime: rideStart + 2 * 60 * 60_000,
        deletedAt: null,
        summary: { distance: 189, movingTimeSec: 165, ridingTimeMillis: 165_000, tss: null },
      },
      {
        id: "strava_representative",
        userId: "test-uid",
        source: "strava",
        type: "Ride",
        startTime: rideStart,
        deletedAt: null,
        summary: { distance: 39_600, movingTimeSec: 5_400, ridingTimeMillis: 5_400_000, tss: 107 },
      },
      {
        id: "orider-duplicate",
        userId: "test-uid",
        source: "orider",
        type: "Ride",
        startTime: rideStart + 30_000,
        deletedAt: null,
        summary: { distance: 39_600, movingTimeSec: 5_400, ridingTimeMillis: 5_400_000, tss: null },
      },
    ]);
    setDocData("users/test-uid/fitness/timeseries_bike", {
      discipline: "bike",
      schemaVersion: 1,
      computedAt: Date.now(),
      startDate: "2026-09-02",
      endDate: "2026-09-03",
      pointCount: 2,
      points: [
        { date: "2026-09-02", ctl: 36.7, atl: 36.8, tsb: -0.1, dailyLoad: 0 },
        { date: "2026-09-03", ctl: 38.3, atl: 45.7, tsb: -7.4, dailyLoad: 107 },
      ],
    });

    renderWithProviders(<FitnessPage />, { authenticated: true, route: "/fitness?sport=bike" });

    expect(await screen.findByText("반영 부하 107 TSS")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /39\.6 km/ })).toBeInTheDocument();
    expect(screen.queryByText("일일 부하 반영을 기다리는 중")).not.toBeInTheDocument();
  });

  it("keeps a genuinely new activity pending until the canonical timeseries covers it", async () => {
    viewport.isMobile = false;
    setCollectionDocs("activities", [{
      id: "new-unprocessed-ride",
      userId: "test-uid",
      source: "orider",
      type: "Ride",
      startTime: Date.parse("2026-08-30T08:00:00.000Z"),
      deletedAt: null,
      summary: { distance: 25_000, movingTimeSec: 3_000, ridingTimeMillis: 3_000_000, tss: null },
    }]);
    setDocData("users/test-uid/fitness/timeseries_bike", {
      discipline: "bike",
      schemaVersion: 1,
      computedAt: Date.now(),
      startDate: "2026-08-29",
      endDate: "2026-08-29",
      pointCount: 1,
      points: [{ date: "2026-08-29", ctl: 37.9, atl: 48.5, tsb: -10.6, dailyLoad: 102 }],
    });

    renderWithProviders(<FitnessPage />, { authenticated: true, route: "/fitness?sport=bike" });

    expect(await screen.findAllByText("일일 부하 반영을 기다리는 중")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /25\.0 km.*일일 부하 반영을 기다리는 중/ })).toBeInTheDocument();
  });

  it("does not pass integrated detail to a single-sport mobile tab", async () => {
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
    expect(screen.getByText("integrated none")).toBeInTheDocument();
    expect(screen.getByText("contributions 0")).toBeInTheDocument();
    expect(screen.getByText("focus 40")).toBeInTheDocument();
  });

  it.each([
    { loading: true, unavailable: false, label: "loading" },
    { loading: false, unavailable: true, label: "failure" },
    { loading: false, unavailable: false, label: "parity-null" },
  ])("keeps canonical PDC Fitness data while Rider Insight is $label", async ({ loading, unavailable }) => {
    riderInsight.enabled = true;
    riderInsight.loading = loading;
    riderInsight.unavailable = unavailable;
    setDocData("users/test-uid/fitness/pdc_bike", parity.persistedPdc);
    setCollectionDocs("activities", [{
      id: "bike-1", userId: "test-uid", type: "Ride", startTime: Date.now(), deletedAt: null,
      summary: { distance: 20_000, ridingTimeMillis: 3_600_000 },
    }]);

    renderWithProviders(<FitnessPage />, { authenticated: true, route: "/fitness?sport=bike" });

    expect(await screen.findByText("cycling ability 12/79")).toBeInTheDocument();
    expect(screen.getByText("PDC summary 73/12/AllRounder")).toBeInTheDocument();
  });

  it("shows validated legacy CP/MMP without displaying non-canonical derived PDC values", async () => {
    const legacy = structuredClone(parity.persistedPdc) as any;
    legacy.version = 1;
    delete legacy.provenance;
    for (const entry of Object.values(legacy.mmpAll) as any[]) {
      delete entry.source;
      delete entry.cohortEligible;
    }
    setDocData("users/test-uid/fitness/pdc_bike", legacy);
    setCollectionDocs("activities", [{ id: "bike-1", userId: "test-uid", type: "Ride",
      startTime: Date.now(), deletedAt: null, summary: { distance: 20_000, ridingTimeMillis: 3_600_000 } }]);

    renderWithProviders(<FitnessPage />, { authenticated: true, route: "/fitness?sport=bike" });

    expect(await screen.findByText("cycling ability none/none")).toBeInTheDocument();
    expect(screen.getByText("PDC summary none/12/none")).toBeInTheDocument();
  });

  it("fails closed when a returned Rider Insight does not match the persisted PDC", async () => {
    riderInsight.enabled = true;
    const mismatched = structuredClone(parity.cardEnvelope);
    mismatched.data.asOf = "2026-07-26T02:00:00.000Z";
    riderInsight.insight = parseCoachRiderInsight(mismatched);
    setDocData("users/test-uid/fitness/pdc_bike", parity.persistedPdc);
    setCollectionDocs("activities", [{
      id: "bike-1", userId: "test-uid", type: "Ride", startTime: Date.now(), deletedAt: null,
      summary: { distance: 20_000, ridingTimeMillis: 3_600_000 },
    }]);

    renderWithProviders(<FitnessPage />, { authenticated: true, route: "/fitness?sport=bike" });

    expect(await screen.findByText("cycling ability none/none")).toBeInTheDocument();
    expect(screen.getByText("PDC summary none/none/none")).toBeInTheDocument();
  });
});
