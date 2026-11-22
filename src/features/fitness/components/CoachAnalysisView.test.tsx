import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PowerCurvePeriodResult, PowerCurvePeriodsResponse } from "@shared/types/power-curve-periods";
import type { TrainingAnalysisPeriodResult, TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";
import CoachAnalysisView from "./CoachAnalysisView";

const mocks = vi.hoisted(() => ({ power: vi.fn(), training: vi.fn(), launcher: vi.fn(), scope: "web" as "web" | "embedded" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => `${key}${params ? ` ${Object.values(params).join(" ")}` : ""}` }) }));
vi.mock("../../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "owner", isAnonymous: false }, signIn: async () => {} }) }));
vi.mock("../../../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => ({ scope: mocks.scope }) }));
vi.mock("../../../hooks/usePowerCurvePeriods", () => ({ usePowerCurvePeriods: (...args: unknown[]) => mocks.power(...args) }));
vi.mock("../../../hooks/useTrainingAnalysisPeriods", () => ({ useTrainingAnalysisPeriods: (...args: unknown[]) => mocks.training(...args) }));
vi.mock("../../../services/trainingAnalysisPeriods", () => ({ trainingAnalysisPeriodsAvailable: () => true }));
vi.mock("../../coach/CoachQuestionLauncher", () => ({ CoachQuestionLauncher: (props: { triggerLabel: string; presetQuestion: string }) => { mocks.launcher(props); return <button type="button">{props.triggerLabel}</button>; } }));
vi.mock("../../../components/charts/CriticalPaceCurve", () => ({ default: (props: { recentPoints: unknown[]; periodLabels?: { recent: string } }) => <div data-testid="pace-curve" data-points={props.recentPoints.length} data-label={props.periodLabels?.recent} /> }));

const DAY = 86_400_000;
const powerPeriod = (watts: Record<number, number>, included: number) => ({
  fromInclusive: 0, toExclusive: 90 * DAY, status: "complete",
  points: Object.entries(watts).map(([seconds, value]) => ({ durationSeconds: Number(seconds), watts: value })),
  coverage: { includedActivityCount: included },
}) as unknown as PowerCurvePeriodResult;
const trainingPeriod = (power: number[], movingSec: number, totalSec: number | null = movingSec) => ({
  fromInclusive: 0, toExclusive: 70 * DAY, status: "complete", coverage: { truncated: false }, totals: { movingTimeSec: { observedValue: movingSec, totalValue: totalSec } },
  zones: { power: { groups: [{ ftp: 240, seconds: power, observedSeconds: power.reduce((a, b) => a + b, 0) }] }, heartRate: { groups: [] } },
}) as unknown as TrainingAnalysisPeriodResult;
const ready = <T,>(response: T) => ({ state: "ready", response, retry: vi.fn() });

function view(props: Partial<Parameters<typeof CoachAnalysisView>[0]> = {}) {
  return render(<MemoryRouter initialEntries={["/ko/coach/analysis?sport=bike"]}><CoachAnalysisView discipline="bike" powerPeriodsEnabled {...props} /></MemoryRouter>);
}

beforeEach(() => {
  mocks.scope = "web";
  mocks.launcher.mockReset();
  mocks.power.mockReset().mockReturnValue(ready({ periods: [powerPeriod({ 5: 900, 300: 312, 1200: 260, 3600: 204 }, 12), powerPeriod({ 5: 900, 300: 300, 1200: 260, 3600: 200 }, 10)] } as unknown as PowerCurvePeriodsResponse));
  mocks.training.mockReset().mockReturnValue(ready({ periods: [trainingPeriod([30, 30, 20, 10, 10], 70 * 3600), trainingPeriod([40, 30, 15, 10, 5], 50 * 3600)] } as unknown as TrainingAnalysisPeriodsResponse));
});

describe("CoachAnalysisView", () => {
  it("요약·파워 커브 표·훈련 구성을 최근/이전 기간 비교로 그린다", () => {
    view();
    const summary = screen.getByTestId("coach-analysis-summary");
    // 변화율·존 비중은 서버 정본이 없어 두지 않고 두 기간 서버 값을 나란히 둔다(P6).
    expect(summary).toHaveTextContent("analysis.concise.fiveMin312 Wanalysis.concise.previousValue 300");
    expect(summary).toHaveTextContent("analysis.concise.sixtyMin204 Wanalysis.concise.previousValue 200");
    expect(summary).not.toHaveTextContent("%");
    const rows = within(screen.getByTestId("coach-analysis-curve")).getAllByRole("row");
    expect(rows).toHaveLength(5);
    expect(rows[2]).toHaveTextContent("duration.min 5312300");
    expect(screen.getByTestId("coach-analysis-curve")).not.toHaveTextContent("%");
    const composition = screen.getByTestId("coach-analysis-composition");
    expect(composition).toHaveTextContent("analysis.concise.totalHours 70.0 50.0");
    expect(within(composition).getAllByRole("group")).toHaveLength(2);
    expect(screen.queryByTestId("coach-analysis-insufficient")).not.toBeInTheDocument();
  });

  it("두 기간을 견줄 수 없으면 요약·커브 대신 한 줄만 두고 훈련 구성은 남긴다", () => {
    mocks.power.mockReturnValue(ready({ periods: [powerPeriod({ 300: 250 }, 3), powerPeriod({}, 0)] }));
    view();
    const notice = screen.getByTestId("coach-analysis-insufficient");
    expect(notice).toHaveTextContent("analysis.concise.insufficient 3");
    expect(within(notice).getByRole("link")).toHaveAttribute("href", expect.stringContaining("focus=virtual-power"));
    expect(screen.queryByTestId("coach-analysis-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("coach-analysis-curve")).not.toBeInTheDocument();
    expect(screen.getByTestId("coach-analysis-composition")).toBeInTheDocument();
  });

  it("일부만 집계된 이동 시간은 ~ 로 표시한다", () => {
    mocks.training.mockReturnValue(ready({ periods: [trainingPeriod([1, 1, 1, 1, 1], 70 * 3600, null), trainingPeriod([1, 1, 1, 1, 1], 50 * 3600)] }));
    view();
    expect(screen.getByTestId("coach-analysis-composition")).toHaveTextContent("analysis.concise.totalHours ~70.0 50.0");
  });

  it("러닝은 페이스 커브와 함께 기록·예측 영역을 둔다", () => {
    view({ discipline: "run", runSlot: <p>러닝 기록 요약</p>, runPaceCurve: { recent28: [{ durationSec: 60, paceSecPerKm: 300 }], prev28: [] } });
    // 서버 기간 페이스가 없으면 고정 28일 커브를 그 창 이름 그대로 둔다(선택 기간처럼 보이지 않게).
    expect(screen.getByTestId("pace-curve")).toHaveAttribute("data-label", "analysis.concise.recent 28");
    expect(screen.getByTestId("coach-analysis-pace")).toHaveTextContent("analysis.concise.fixedWindow");
    expect(screen.getByText("러닝 기록 요약")).toBeInTheDocument();
  });

  it("러닝 페이스는 서버 기간 통계가 있으면 선택 기간을 따른다", () => {
    const running = (pace: number) => ({ paceCurves: [{ sourceBasis: "run_metrics_pace_curve", points: [{ durationSeconds: 300, paceSecPerKm: pace }, { durationSeconds: 600, paceSecPerKm: pace + 10 }] }] });
    mocks.training.mockReturnValue(ready({ periods: [{ ...trainingPeriod([1, 1, 1, 1, 1], 3600), running: running(240) }, { ...trainingPeriod([1, 1, 1, 1, 1], 3600), running: running(250) }] }));
    view({ discipline: "run", runPaceCurve: { recent28: [{ durationSec: 60, paceSecPerKm: 300 }], prev28: [] } });
    expect(screen.getByTestId("pace-curve")).toHaveAttribute("data-points", "2");
    expect(screen.getByTestId("pace-curve")).toHaveAttribute("data-label", "analysis.concise.recent 90");
    expect(screen.getByTestId("coach-analysis-pace")).not.toHaveTextContent("analysis.concise.fixedWindow");
  });

  it("체중 기준 값이 없으면 W/kg 를 고를 수 없고 파워 커브 카드는 남는다", () => {
    view();
    const toggle = within(screen.getByTestId("coach-analysis-curve")).getByRole("button", { name: "W/kg" });
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(screen.getByTestId("coach-analysis-curve")).toBeInTheDocument();
  });

  it("두 기간 존 종류가 다르면 기간마다 종류를 붙인다", () => {
    const hrPeriod = { ...trainingPeriod([1, 1, 1, 1, 1], 3600), zones: { power: { groups: [] }, heartRate: { groups: [{ boundaries: { reference: "lthr", referenceBpm: 170 }, seconds: [1, 1, 1, 1, 1], observedSeconds: 5 }] } } };
    mocks.training.mockReturnValue(ready({ periods: [trainingPeriod([1, 1, 1, 1, 1], 3600), hrPeriod] }));
    view();
    const labels = within(screen.getByTestId("coach-analysis-composition")).getAllByRole("group").map(group => group.getAttribute("aria-label"));
    expect(labels).toEqual(["analysis.concise.recentShort · analysis.concise.powerBasis", "analysis.concise.previousShort · analysis.concise.heartRateBasis"]);
  });

  it("앱 임베드에서는 비교 불가 줄에 웹 설정 링크를 두지 않는다", () => {
    mocks.scope = "embedded";
    mocks.power.mockReturnValue(ready({ periods: [powerPeriod({}, 1), powerPeriod({}, 0)] }));
    view();
    expect(within(screen.getByTestId("coach-analysis-insufficient")).queryByRole("link")).not.toBeInTheDocument();
  });

  it("기간 탭을 바꾸면 마지막으로 고른 기간 하나로 두 비교를 다시 부른다", async () => {
    view();
    const days = (call: unknown[] | undefined) => { const periods = (call?.[1] as { request: { periods: { fromInclusive: number; toExclusive: number }[] } }).request.periods; return Math.round((periods[0]!.toExclusive - periods[0]!.fromInclusive) / DAY); };
    expect(days(mocks.power.mock.lastCall)).toBe(90);
    fireEvent.click(screen.getByRole("button", { name: "range.180" }));
    fireEvent.click(screen.getByRole("button", { name: "range.30" }));
    expect(days(mocks.power.mock.lastCall)).toBe(90);
    await waitFor(() => expect(days(mocks.power.mock.lastCall)).toBe(30));
    expect(days(mocks.training.mock.lastCall)).toBe(30);
    expect(mocks.power.mock.calls.some(call => call[1] && days(call) === 180)).toBe(false);
  });

  it("계획에 반영은 분석 수치를 담은 코치 질문으로 열고, FTP 재평가는 제안이 있을 때만 둔다", () => {
    const first = view();
    expect(mocks.launcher.mock.lastCall![0].presetQuestion).toContain("analysis.concise.planQuestion 90");
    expect(mocks.launcher.mock.lastCall![0].presetQuestion).not.toContain("%");
    expect(screen.queryByTestId("coach-analysis-ftp")).not.toBeInTheDocument();
    first.unmount();
    view({ ftpReviewAvailable: true });
    expect(screen.getByTestId("coach-analysis-ftp")).toHaveAttribute("href", expect.stringContaining("detail=ftp-decision"));
  });

  it("기간 파워 비교가 닫힌 환경은 기존 커브를 그대로 둔다", () => {
    mocks.power.mockReturnValue({ state: "preparing", response: null });
    view({ powerPeriodsEnabled: false, fallbackPowerCurve: <p>28일 커브</p> });
    expect(screen.getByText("28일 커브")).toBeInTheDocument();
    expect(screen.queryByTestId("coach-analysis-insufficient")).not.toBeInTheDocument();
  });
});
