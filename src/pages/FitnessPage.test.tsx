import { screen, waitFor } from "@testing-library/react";
import { getDoc, onSnapshot } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { setCollectionDocs, setDocData } from "../__tests__/mocks/firebase";
import parity from "../features/coach/__fixtures__/rider-insight-parity.json";
import { parseCoachRiderInsight } from "../services/coachRiderInsightContract";
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
  default: ({ data }: { data: { discipline: string; ctl: number; atl: number; tsb: number; combinedLoad?: { ctl: number; contributions: unknown[] } | null; loadFocus: { totalLoad: number }; cyclingAbility?: { activityCount: number; axes: Array<{ score: number | null }> } | null; pdcSummary?: { riderType?: { type: string } | null; abilityScore?: number | null; activityCount?: number | null } | null } }) => (
    <div>
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
  default: ({ combinedLoad, loadFocus }: { combinedLoad?: { ctl: number } | null; loadFocus: { totalLoad: number } }) => (
    <div>
      desktop tri fitness dashboard
      <span>desktop integrated {combinedLoad?.ctl ?? "none"}</span>
      <span>desktop focus {loadFocus.totalLoad}</span>
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

    renderWithProviders(<FitnessPage />, {
      authenticated: true,
      route: "/fitness?sport=tri",
    });

    expect(await screen.findByText("desktop tri fitness dashboard")).toBeInTheDocument();
    expect(screen.getByText("desktop integrated 48")).toBeInTheDocument();
    expect(screen.queryByText("mobile fitness dashboard: tri")).not.toBeInTheDocument();
  });

  it("keeps today's workout out of an empty single-sport desktop tab", async () => {
    viewport.isMobile = false;
    renderWithProviders(<FitnessPage />, { authenticated: true, route: "/fitness?sport=bike" });
    expect(await screen.findByText("피트니스 차트를 만들 활동이 아직 없어요")).toBeInTheDocument();
    expect(screen.queryByTestId("desktop-full-ai-coach")).not.toBeInTheDocument();
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
