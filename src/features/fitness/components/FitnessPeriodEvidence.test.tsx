import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import FitnessPeriodEvidence from "./FitnessPeriodEvidence";
import { periodFixture } from "../../../services/trainingAnalysisPeriods.fixture";
import type { TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";
const mocks = vi.hoisted(() => ({ environment: "production", available: true, response: null as TrainingAnalysisPeriodsResponse | null, hook: vi.fn() }));
vi.mock("../../../services/runtimeConfig", () => ({ getRuntimeConfig: () => ({ appEnvironment: mocks.environment }) }));
vi.mock("../../../services/trainingAnalysisPeriods", () => ({ trainingAnalysisPeriodsAvailable: () => mocks.available }));
vi.mock("../../../hooks/useTrainingAnalysisPeriods", () => ({ useTrainingAnalysisPeriods: (...args: unknown[]) => { mocks.hook(...args); return { state: mocks.response ? "ready" : "idle", response: mocks.response, retry: vi.fn() }; } }));
vi.mock("./BikePeriodSnapshotPanel", () => ({ default: ({ historyOnly }: { historyOnly: boolean }) => <div data-testid="saved-bike-results" data-history-only={String(historyOnly)} /> }));
vi.mock("../../activity/detail/RunPeriodComparisonPanel", () => ({ default: () => null }));
vi.mock("../../activity/detail/TrainingPeriodZonesPanel", () => ({ default: () => null }));
vi.mock("../../activity/detail/RunEffortStageManagementPanel", () => ({ default: () => null }));
beforeEach(() => { mocks.environment = "production"; mocks.available = true; mocks.response = null; mocks.hook.mockClear(); });
describe("period evidence capability boundary", () => {
  it("connects the hosted bike entry to an explicit period read without Stage run options", () => {
    renderWithProviders(<FitnessPeriodEvidence discipline="bike" inline />, { authenticated: true });
    expect(screen.getByTestId("K5-5-2").tagName).toBe("SECTION");
    expect(mocks.hook).toHaveBeenLastCalledWith("test-uid", null, true);
    fireEvent.click(screen.getByRole("button", { name: "기간 분석 불러오기" }));
    const selection = mocks.hook.mock.lastCall?.[1];
    expect(selection.request).toEqual({
      discipline: "bike", includeCyclingClimbObservations: true,
      periods: expect.arrayContaining([expect.objectContaining({ fromInclusive: expect.any(Number), toExclusive: expect.any(Number) })]),
    });
    expect(selection.request.periods).toHaveLength(2);
  });
  it("does not expose Stage-only swim in hosted production", () => {
    renderWithProviders(<FitnessPeriodEvidence discipline="swim" />, { authenticated: true });
    expect(screen.queryByTestId("K5-5-2")).not.toBeInTheDocument();
    expect(mocks.hook).not.toHaveBeenCalled();
  });
  it("exposes hosted run period analysis equally with bike", () => {
    renderWithProviders(<FitnessPeriodEvidence discipline="run" />, { authenticated: true });
    expect(screen.getByTestId("K5-5-2")).toBeInTheDocument();
    expect(mocks.hook).toHaveBeenCalled();
  });
  it("does not mount the owner period hook for a signed-out visitor", () => {
    renderWithProviders(<FitnessPeriodEvidence discipline="bike" />, { authenticated: false });
    expect(mocks.hook).not.toHaveBeenCalled();
  });
  it("keeps an unapproved hosted bike entry hidden and mounts no period hook", () => {
    mocks.available = false;
    renderWithProviders(<FitnessPeriodEvidence discipline="bike" />, { authenticated: true });
    expect(screen.queryByTestId("K5-5-2")).not.toBeInTheDocument();
    expect(mocks.hook).not.toHaveBeenCalled();
  });
  it.each([false, true])("keeps existing stored-history and training-log paths for hosted coverage truncated=%s", truncated => {
    mocks.response = periodFixture();
    const period = mocks.response.periods[0]!;
    period.coverage.truncated = truncated;
    period.status = truncated ? "partial" : "complete";
    if (truncated) period.totals.distanceM.totalValue = null;
    renderWithProviders(<FitnessPeriodEvidence discipline="bike" inline />, { authenticated: true });
    expect(screen.getByTestId("saved-bike-results")).toHaveAttribute("data-history-only", String(!truncated));
    expect(screen.getByRole("link", { name: "선택한 날의 훈련일지 보기" })).toHaveAttribute("href", expect.stringContaining("/athlete/me/activities?sport=bike&date=1970-01-01"));
    expect(screen.getByTestId("K5-5-2")).toHaveTextContent("1970-01-01");
    if (truncated) expect(screen.getByTestId("K5-5-2")).toHaveTextContent("—");
    expect(mocks.hook).toHaveBeenLastCalledWith("test-uid", null, true);
  });
  it("does not submit before explicit selection and keeps run period extensions", () => {
    mocks.environment = "stage";
    renderWithProviders(<FitnessPeriodEvidence discipline="run" />, { authenticated: true });
    expect(screen.getByTestId("K5-5-2")).toBeInTheDocument();
    expect(mocks.hook).toHaveBeenLastCalledWith("test-uid", null, true);
    fireEvent.click(screen.getByRole("button", { name: "기간 분석 불러오기" }));
    expect(mocks.hook).toHaveBeenLastCalledWith("test-uid", expect.objectContaining({ request: expect.objectContaining({ discipline: "run", includeExpandedRunDistances: true, includeRunningPaceZones: true, includeStageRunEffortPreferences: true, periods: expect.any(Array) }) }), true);
  });
  it("opens the inline condition controls without starting a period request", () => {
    mocks.environment = "stage";
    renderWithProviders(<FitnessPeriodEvidence discipline="bike" inline />, { authenticated: true });
    expect(screen.getByTestId("K5-5-2").tagName).toBe("SECTION");
    expect(screen.getByRole("button", { name: "기간 분석 불러오기" })).toBeVisible();
    expect(mocks.hook).toHaveBeenLastCalledWith("test-uid", null, true);
  });
  it("keeps the Stage callable guard disabled when capability or origin is unavailable", () => {
    mocks.environment = "stage"; mocks.available = false;
    renderWithProviders(<FitnessPeriodEvidence discipline="swim" />, { authenticated: true });
    expect(screen.getByRole("button", { name: "기간 분석 불러오기" })).toBeDisabled();
    expect(mocks.hook).toHaveBeenLastCalledWith("test-uid", null, false);
  });
});
