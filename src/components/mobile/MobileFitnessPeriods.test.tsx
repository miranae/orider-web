import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { getCurrentUser } from "../../__tests__/mocks/firebase";
import MobileFitnessPage, { type MobileFitnessData } from "./MobileFitnessPage";

const mocks = vi.hoisted(() => ({ periods: vi.fn((_ownerUid: string, _selection: unknown, _enabled: boolean) => ({ state: "idle", response: null })) }));
vi.mock("../../hooks/usePowerCurvePeriods", () => ({ usePowerCurvePeriods: mocks.periods }));
vi.mock("./SportPerformanceCard", () => ({ default: () => null }));
const data = { ctl: 0, atl: 0, tsb: 0, pmcHistory: [], weeklyTSS: [], thisWeekTSS: 0, avgWeekTSS: 0, restDays: 0,
  threshold: null, hasLoadData: false, combinedLoad: null, loadFocus: null, cyclingAbility: null,
  runEvidence: { thresholdPaceSec: null, records: [] },
  swimEvidence: { windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 },
  zones: [], zoneSource: "none", discipline: "bike" } satisfies MobileFitnessData;

describe("mobile period power analysis", () => {
  it("mounts on expansion and requests only when the owner explicitly loads a period", async () => {
    mocks.periods.mockClear();
    const user = userEvent.setup();
    renderWithProviders(<MobileFitnessPage data={data} powerCurvePeriodsOwnerUid="test-uid" powerCurvePeriodsEnabled />, { authenticated: true });
    await user.click(screen.getByRole("button", { name: "파워존" }));
    expect(mocks.periods).not.toHaveBeenCalled();
    const summary = screen.getByText("기간별 실측 파워 비교");
    const disclosure = summary.closest("details")!;
    disclosure.open = true; fireEvent(disclosure, new Event("toggle"));
    await waitFor(() => expect(mocks.periods).toHaveBeenCalled());
    expect(mocks.periods.mock.calls.every(call => call[1] === null)).toBe(true);
    await user.click(screen.getByRole("button", { name: "기간 분석 불러오기" }));
    expect(mocks.periods.mock.lastCall?.[1]).not.toBeNull();
    const count = mocks.periods.mock.calls.length;
    disclosure.open = false; fireEvent(disclosure, new Event("toggle"));
    disclosure.open = true; fireEvent(disclosure, new Event("toggle"));
    expect(mocks.periods.mock.calls.length).toBe(count);
  });
  it("hides owner period tools for a different account", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MobileFitnessPage data={data} powerCurvePeriodsOwnerUid="other-owner" powerCurvePeriodsEnabled />, { authenticated: true });
    await user.click(screen.getByRole("button", { name: "파워존" }));
    expect(screen.queryByText("기간별 실측 파워 비교")).not.toBeInTheDocument();
  });
  it.each(["signed-out", "anonymous"])("hides period tools for %s users", async kind => {
    mocks.periods.mockClear();
    const user = userEvent.setup();
    renderWithProviders(<MobileFitnessPage data={data} powerCurvePeriodsOwnerUid="test-uid" powerCurvePeriodsEnabled />, { authenticated: kind === "anonymous" });
    if (kind === "anonymous") Object.assign(getCurrentUser()!, { isAnonymous: true });
    await user.click(screen.getByRole("button", { name: "파워존" }));
    expect(screen.queryByText("기간별 실측 파워 비교")).not.toBeInTheDocument();
    expect(mocks.periods).not.toHaveBeenCalled();
  });
  it("keeps loading disabled when the stage capability is off", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MobileFitnessPage data={data} powerCurvePeriodsOwnerUid="test-uid" />, { authenticated: true });
    await user.click(screen.getByRole("button", { name: "파워존" }));
    const disclosure = screen.getByText("기간별 실측 파워 비교").closest("details")!;
    disclosure.open = true; fireEvent(disclosure, new Event("toggle"));
    expect(screen.getByRole("button", { name: "기간 분석 불러오기" })).toBeDisabled();
    expect(mocks.periods.mock.lastCall?.[2]).toBe(false);
  });

});
