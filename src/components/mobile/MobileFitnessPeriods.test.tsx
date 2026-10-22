import { fireEvent, screen, waitFor } from "@testing-library/react";
import enDashboard from "../../i18n/resources/en/dashboard.json";
import koDashboard from "../../i18n/resources/ko/dashboard.json";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { getCurrentUser } from "../../__tests__/mocks/firebase";
import MobileFitnessPage, { type MobileFitnessData } from "./MobileFitnessPage";
import { BikePowerCurveEvidence } from "../../features/fitness/components/BikePowerCurveEvidence";
import { chooseDropdown } from "../../features/fitness/fitnessControlTestUtils";

const mocks = vi.hoisted(() => ({ periods: vi.fn((_ownerUid: string, _selection: unknown, _enabled: boolean) => ({ state: "idle", response: null })) }));
vi.mock("../../hooks/usePowerCurvePeriods", () => ({ usePowerCurvePeriods: mocks.periods }));
vi.mock("./SportPerformanceCard", () => ({ default: () => null }));
const data = { ctl: 0, atl: 0, tsb: 0, pmcHistory: [], weeklyTSS: [], thisWeekTSS: 0, avgWeekTSS: 0, restDays: 0,
  threshold: null, hasLoadData: false, combinedLoad: null, loadFocus: null, cyclingAbility: null,
  runEvidence: { thresholdPaceSec: null, records: [] },
  swimEvidence: { windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 },
  zones: [], zoneSource: "none", discipline: "bike" } satisfies MobileFitnessData;

describe("mobile period power analysis", () => {
  it("uses the same source-preserving condition curve instead of the recent-only mini chart", () => {
    const current = [
      { durationSeconds: 1, maxPower: 938, sourceActivityId: "peak-1s", startTime: 1000 },
      { durationSeconds: 5, maxPower: 854 }, { durationSeconds: 60, maxPower: 436 },
      { durationSeconds: 300, maxPower: 264, sourceActivityId: "recent-5m", startTime: 2000 },
      { durationSeconds: 1200, maxPower: 196 },
    ];
    const previous = [{ durationSeconds: 300, maxPower: 246, sourceActivityId: "previous-5m", startTime: 1000 }];
    const { container } = renderWithProviders(<MobileFitnessPage part="condition" embedded data={{ ...data, powerCurve: current }}
      powerCurveEvidenceSlot={<BikePowerCurveEvidence current={current} previous={previous} />} />);
    expect(container.querySelectorAll('[data-testid="K5-2-1"]')).toHaveLength(1);
    expect(container.querySelector("[data-power-curve-visual]")).toBeNull();
    expect(screen.getByTestId("K5-2-2")).toHaveTextContent("854");
    expect(screen.getByTestId("K5-2-2")).toHaveTextContent("436");
    expect(screen.getByTestId("K5-2-2")).toHaveTextContent("264");
    expect(screen.getByTestId("K5-2-2")).toHaveTextContent("196");
    expect(screen.getByText("246")).toBeInTheDocument();
    expect(container.querySelector('a[href$="/activity/recent-5m"]')).toBeInTheDocument();
    expect(container.querySelector('a[href$="/activity/previous-5m"]')).toBeInTheDocument();
    chooseDropdown(screen.getByRole("combobox", { name: /지속시간/ }), "1초");
    expect(screen.getByText("938")).toBeInTheDocument();
    expect(container.querySelector('a[href$="/activity/peak-1s"]')).toBeInTheDocument();
  });
  it.each(["loading", "error"] as const)("keeps the shared power evidence behind the derived %s gate", derived => {
    renderWithProviders(<MobileFitnessPage part="condition" embedded data={data} sectionState={{ trend: "ready", derived }}
      powerCurveEvidenceSlot={<div data-testid="shared-condition-power" />} />);
    expect(screen.queryByTestId("shared-condition-power")).not.toBeInTheDocument();
  });
  it("keeps the condition curve, single period request and both zone distributions in reading order", () => {
    mocks.periods.mockClear();
    renderWithProviders(<MobileFitnessPage part="condition" embedded data={{ ...data,
      powerCurve: [{ durationSeconds: 5, maxPower: 850 }, { durationSeconds: 300, maxPower: 264 }],
      zoneEvidence: { windowDays: 30, startTime: Date.UTC(2026, 8, 19), endTime: Date.UTC(2026, 9, 19),
        hr: { counts: [10, 0, 0, 0, 0], total: 10, recordCount: 1, missingCount: 0, boundaries: null },
        power: { counts: [10, 0, 0, 0, 0, 0, 0], total: 10, recordCount: 1, missingCount: 0 } },
    }} powerCurvePeriodsOwnerUid="test-uid" />, { authenticated: true });
    const curve = screen.getByTestId("K5-2-1");
    const periods = screen.getByRole("heading", { name: "기간별 실측 파워 비교" });
    const zones = screen.getByRole("heading", { name: "심박 존 분포" });
    expect(curve.compareDocumentPosition(periods) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(periods.compareDocumentPosition(zones) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByTestId("K5-5")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "기간 분석 불러오기" })).toBeDisabled();
    expect(mocks.periods.mock.calls.every(call => call[1] === null && call[2] === false)).toBe(true);
  });
  it("mounts on expansion and requests only when the owner explicitly loads a period", async () => {
    mocks.periods.mockClear();
    const user = userEvent.setup();
    renderWithProviders(<MobileFitnessPage data={data} powerCurvePeriodsOwnerUid="test-uid" powerCurvePeriodsEnabled />, { authenticated: true });
    await user.click(screen.getByRole("button", { name: "분석" }));
    expect(mocks.periods).not.toHaveBeenCalled();
    const summary = screen.getByText("기간별 실측 파워 비교");
    const disclosure = summary.closest("details")!;
    disclosure.open = true; fireEvent(disclosure, new Event("toggle"));
    await waitFor(() => expect(mocks.periods).toHaveBeenCalled());
    expect(screen.getAllByText("기간별 실측 파워 비교")).toHaveLength(1);
    expect(screen.queryByRole("heading", { level: 3, name: "기간별 실측 파워 비교" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "기간별 실측 파워 비교" })).toBeInTheDocument();

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
    await user.click(screen.getByRole("button", { name: "분석" }));
    expect(screen.queryByText("기간별 실측 파워 비교")).not.toBeInTheDocument();
  });
  it.each(["signed-out", "anonymous"])("hides period tools for %s users", async kind => {
    mocks.periods.mockClear();
    const user = userEvent.setup();
    renderWithProviders(<MobileFitnessPage data={data} powerCurvePeriodsOwnerUid="test-uid" powerCurvePeriodsEnabled />, { authenticated: kind === "anonymous" });
    if (kind === "anonymous") Object.assign(getCurrentUser()!, { isAnonymous: true });
    await user.click(screen.getByRole("button", { name: "분석" }));
    expect(screen.queryByText("기간별 실측 파워 비교")).not.toBeInTheDocument();
    expect(mocks.periods).not.toHaveBeenCalled();
  });
  it("keeps loading disabled when the stage capability is off", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MobileFitnessPage data={data} powerCurvePeriodsOwnerUid="test-uid" />, { authenticated: true });
    await user.click(screen.getByRole("button", { name: "분석" }));
    const disclosure = screen.getByText("기간별 실측 파워 비교").closest("details")!;
    disclosure.open = true; fireEvent(disclosure, new Event("toggle"));
    expect(screen.getByRole("button", { name: "기간 분석 불러오기" })).toBeDisabled();
    expect(mocks.periods.mock.lastCall?.[2]).toBe(false);
  });

});

describe("mobile sport threshold information", () => {
  it("provides readable Korean and English analysis and missing-data labels", () => {
    expect(koDashboard.mobileFitness.tabAnalysis).toBe("분석");
    expect(enDashboard.mobileFitness.tabAnalysis).toBe("Analysis");
    for (const copy of [koDashboard.mobileFitness, enDashboard.mobileFitness]) {
      expect(copy.thresholdMissingRun).not.toMatch(/FTP|182|0 W/);
      expect(copy.thresholdMissingSwim).toContain("CSS");
      expect(copy.hrZonesMissing.length).toBeGreaterThan(20);
    }
  });
  it.each([
    { discipline: "run" as const, button: "러닝 분석", missing: "러닝 역치 페이스가 설정되지 않았어요. 설정한 페이스가 있을 때 표시합니다." },
    { discipline: "swim" as const, button: "수영", missing: "수영 임계 속도(CSS)가 설정되지 않았어요. 설정한 속도가 있을 때 표시합니다." },
  ])("shows precise missing $discipline threshold and zones, including embedded views", async ({ discipline, button, missing }) => {
    mocks.periods.mockClear();
    const user = userEvent.setup();
    renderWithProviders(<MobileFitnessPage data={{ ...data, discipline }} embedded powerCurvePeriodsOwnerUid="test-uid" powerCurvePeriodsEnabled />, { authenticated: true });
    const analysisToggle = document.querySelector<HTMLButtonElement>(".mobile-fitness-mode-toggle")!;
    expect(analysisToggle).toHaveAccessibleName(button);
    await user.click(analysisToggle);
    expect(screen.getByText(missing)).toBeInTheDocument();
    expect(screen.getByText("저장된 심박존 분포가 아직 없어요. 확인된 심박존 데이터가 있을 때 표시합니다.")).toBeInTheDocument();
    expect(screen.queryByText("FTP")).not.toBeInTheDocument();
    expect(screen.queryByText("기간별 실측 파워 비교")).not.toBeInTheDocument();
    expect(mocks.periods).not.toHaveBeenCalled();
  });
  it.each(["loading", "error"] as const)("does not report unset data before derived sections are %s", async derived => {
    const user = userEvent.setup();
    renderWithProviders(<MobileFitnessPage data={{ ...data, discipline: "run" }} sectionState={{ trend: "ready", derived }} />);
    await user.click(screen.getByRole("button", { name: "러닝 분석" }));
    expect(screen.queryByText("러닝 역치 페이스가 설정되지 않았어요. 설정한 페이스가 있을 때 표시합니다.")).not.toBeInTheDocument();
    expect(screen.queryByText("저장된 심박존 분포가 아직 없어요. 확인된 심박존 데이터가 있을 때 표시합니다.")).not.toBeInTheDocument();
    expect(screen.getByRole(derived === "loading" ? "status" : "alert")).toBeInTheDocument();
  });
  it("keeps measured HR zones visible when the running threshold is missing", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MobileFitnessPage data={{ ...data, discipline: "run", zoneSource: "hr", zones: [{ name: "Easy", pct: 100, color: "var(--aqua)", rangeLabel: "100–120 bpm", percentLabel: "50–60%" }] }} />);
    await user.click(screen.getByRole("button", { name: "러닝 분석" }));
    expect(screen.getByText("러닝 역치 페이스가 설정되지 않았어요. 설정한 페이스가 있을 때 표시합니다.")).toBeInTheDocument();
    expect(screen.getByText("심박 존 분포 · 최근 4주")).toBeInTheDocument();
    expect(screen.queryByText("저장된 심박존 분포가 아직 없어요. 확인된 심박존 데이터가 있을 때 표시합니다.")).not.toBeInTheDocument();
  });
});
