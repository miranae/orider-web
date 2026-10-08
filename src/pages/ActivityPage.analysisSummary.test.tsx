import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type AnalysisTab from "../components/AnalysisTab";
import type { ActivityAnalysisModel } from "../hooks/useActivityAnalysisModel";
import { createMockActivity } from "../__tests__/fixtures/mockData";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import ActivityPage from "./ActivityPage";

const mocks = vi.hoisted(() => ({
  model: null as ActivityAnalysisModel | null,
  analysisProps: vi.fn(),
  requestStreams: vi.fn(),
}));
vi.mock("../hooks/useActivityAnalysisModel", () => ({ useActivityAnalysisModel: () => mocks.model }));
vi.mock("../hooks/useFitnessTimeseries", () => ({ useFitnessTimeseries: () => ({ timeseries: null }) }));
vi.mock("../hooks/usePdc", () => ({ usePdc: () => ({ pdc: null }) }));
vi.mock("../components/AnalysisTab", () => ({ default: (props: ComponentProps<typeof AnalysisTab>) => {
  mocks.analysisProps(props);
  return <div data-testid="summary-analysis">Analysis</div>;
}, AnalysisLapTable: () => <div data-testid="summary-laps">Laps</div> }));
vi.mock("../components/RouteMap", () => ({ default: () => <div /> }));
vi.mock("../components/ElevationChart", () => ({ default: () => <div /> }));
vi.mock("../components/activity/AiRideAnalysisCard", () => ({ default: () => <div /> }));
vi.mock("react-router-dom", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-router-dom")>(),
  useParams: () => ({ activityId: "summary-only" }),
  useOutletContext: () => null,
}));

beforeEach(() => {
  mocks.analysisProps.mockClear();
  mocks.requestStreams.mockClear();
  const activity = createMockActivity({ id: "summary-only", userId: "test-uid", source: "orider" });
  mocks.model = {
    activity, setActivity: vi.fn(), loadingActivity: false, activityLoadError: null,
    activityProcessing: false, retryActivity: vi.fn(), streams: null, effectiveStreams: null,
    loadingStreams: false, showStreamSpinner: false, streamsError: null, retryStreams: vi.fn(),
    requestStreams: mocks.requestStreams,
    serverMetrics: { status: "ready", metrics: { version: 35 } },
    overview: { loading: false, response: null, enabled: true, error: false, retry: vi.fn() },
    isActivityOwner: true, sport: "ride", streamSensorSummary: null,
    displayedSummary: activity.summary, avgPowerValue: null, normalizedPowerValue: null,
    hasStreamPowerCandidate: false, hasStreamHeartRateCandidate: false,
    hasStreamCadenceCandidate: false, hasAnalysisStreams: true, analysisProjection: null,
    sensorSelectionContext: {},
    analysisTabProps: {
      activityId: activity.id, isOwner: true, startTime: activity.startTime,
      sport: "ride", summary: activity.summary,
      streams: { userId: activity.userId, time: [], distance: [] },
      serverMetrics: { status: "ready", metrics: { version: 35 } },
    },
    canRecalculateVirtualPowerPreview: false, recalculateVirtualPowerPreview: vi.fn(),
    revertVirtualPowerPreview: vi.fn(), activePowerOverride: null,
  } as unknown as ActivityAnalysisModel;
});

describe("ActivityPage server summary presentation", () => {
  it("renders analysis with no downloaded streams or stream projection", () => {
    renderWithProviders(<ActivityPage />, { authenticated: true });
    expect(mocks.requestStreams).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "분석" }));
    expect(screen.getByTestId("summary-analysis")).toBeInTheDocument();
    expect(mocks.analysisProps.mock.lastCall?.[0]).toMatchObject({
      activityId: "summary-only", isOwner: true, streams: { time: [], distance: [] },
    });
    expect(mocks.requestStreams).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "내보내기" }));
    expect(mocks.requestStreams).toHaveBeenCalledTimes(1);
  });

  it("shows saved laps without requesting streams on the laps tab", () => {
    mocks.model!.analysisTabProps!.analysisSummary = {
      schemaVersion: 1, laps: [{ number: 7, distanceKm: 1, durationMs: 300000 }],
      caloriesFallbackKcal: null, hasAnalysisStreams: true, sensors: null,
      correctedAverages: {
        averageHeartRate: null, maxHeartRate: null, averageCadence: null, maxCadence: null,
        averagePower: null, maxPower: null, normalizedPower: null, tss: null,
      },
    };
    renderWithProviders(<ActivityPage />, { authenticated: true });
    fireEvent.click(screen.getByRole("tab", { name: /랩/u }));
    expect(screen.getByTestId("summary-laps")).toBeInTheDocument();
    expect(mocks.requestStreams).not.toHaveBeenCalled();
  });
});
