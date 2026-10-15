import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import FitnessPeriodEvidence from "./FitnessPeriodEvidence";
const mocks = vi.hoisted(() => ({ environment: "production", available: true, hook: vi.fn() }));
vi.mock("../../../services/runtimeConfig", () => ({ getRuntimeConfig: () => ({ appEnvironment: mocks.environment }) }));
vi.mock("../../../services/trainingAnalysisPeriods", () => ({ trainingAnalysisPeriodsAvailable: () => mocks.available }));
vi.mock("../../../hooks/useTrainingAnalysisPeriods", () => ({ useTrainingAnalysisPeriods: (...args: unknown[]) => { mocks.hook(...args); return { state: "idle", response: null, retry: vi.fn() }; } }));
vi.mock("../../activity/detail/RunPeriodComparisonPanel", () => ({ default: () => null }));
vi.mock("../../activity/detail/TrainingPeriodZonesPanel", () => ({ default: () => null }));
vi.mock("../../activity/detail/RunEffortStageManagementPanel", () => ({ default: () => null }));
beforeEach(() => { mocks.environment = "production"; mocks.available = true; mocks.hook.mockClear(); });
describe("K5 Stage period evidence boundary", () => {
  it("renders no Stage section and mounts no period hook in operating", () => {
    renderWithProviders(<FitnessPeriodEvidence discipline="bike" />, { authenticated: true });
    expect(screen.queryByTestId("K5-5-2")).not.toBeInTheDocument();
    expect(mocks.hook).not.toHaveBeenCalled();
  });
  it("does not submit before explicit selection and keeps run period extensions", () => {
    mocks.environment = "stage";
    renderWithProviders(<FitnessPeriodEvidence discipline="run" />, { authenticated: true });
    expect(screen.getByTestId("K5-5-2")).toBeInTheDocument();
    expect(mocks.hook).toHaveBeenLastCalledWith("test-uid", null, true);
    fireEvent.click(screen.getByRole("button", { name: "기간 분석 불러오기" }));
    expect(mocks.hook).toHaveBeenLastCalledWith("test-uid", expect.objectContaining({ request: expect.objectContaining({ discipline: "run", includeExpandedRunDistances: true, includeRunningPaceZones: true, includeStageRunEffortPreferences: true, periods: expect.any(Array) }) }), true);
  });
  it("keeps the Stage callable guard disabled when capability or origin is unavailable", () => {
    mocks.environment = "stage"; mocks.available = false;
    renderWithProviders(<FitnessPeriodEvidence discipline="swim" />, { authenticated: true });
    expect(screen.getByRole("button", { name: "기간 분석 불러오기" })).toBeDisabled();
    expect(mocks.hook).toHaveBeenLastCalledWith("test-uid", null, false);
  });
});
