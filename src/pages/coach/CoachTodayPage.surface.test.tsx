import { render, screen, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TodayTrainingDecisionState } from "../../hooks/useTodayTrainingDecision";
import CoachTodayPage from "./CoachTodayPage";

const mocks = vi.hoisted(() => ({
  state: { decision: null, loading: false, unavailable: true, unavailableReason: "disabled", scheduledOnly: true, refresh: vi.fn() } as TodayTrainingDecisionState,
  sport: "bike", point: { ctl: 40, atl: 45, tsb: -5, date: "2026-10-14", dailyLoad: 0 } as Record<string, unknown> | null,
  canonical: true,
  launcher: [] as Array<{ triggerLabel?: string; progressPlannerSelection: unknown }>,
}));
const t = (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "owner" }, signIn: vi.fn() }) }));
vi.mock("../../components/redesign/DisciplineTabs", () => ({ default: () => <div>sport tabs</div> }));
vi.mock("../../features/training/plan/PlanRecordNavigation", () => ({ default: () => <nav>plan record tabs</nav> }));
vi.mock("./CoachFitnessModelContext", () => ({ useCoachFitnessModel: () => ({ t,
  user: { uid: "owner" }, discipline: mocks.sport, currentPoint: mocks.point, i18n: { language: "ko" },
  hasCanonicalTimeseries: mocks.canonical, fitnessData: [], disciplineActivities: [], loading: false, timeseriesLoaded: true, error: null,
}) }));
vi.mock("../../features/coach/CoachQuestionLauncher", () => ({ CoachQuestionLauncher: (props: { triggerLabel?: string; progressPlannerSelection: unknown }) => {
  mocks.launcher.push(props);
  return <button type="button">{props.triggerLabel}</button>;
} }));
vi.mock("../../features/trainingDecision/TodayTrainingDecisionCard", () => ({
  TodayTrainingDecisionSource: ({ children }: { children: (state: TodayTrainingDecisionState) => React.ReactNode }) => children(mocks.state),
}));

function session(workout: string, targetTss: number | null) {
  return { sessionId: "s1", current: { workout, durationMin: 60, targetTss, completed: false } };
}
function decisionWith(sessions: ReturnType<typeof session>[], health = "clear") {
  return { scheduledSessions: sessions, effectiveSessions: sessions, representativeSessionId: "s1", healthGate: { state: health },
    mode: "scheduled-only", recommendationSource: null, capabilities: {} } as never;
}

beforeEach(() => {
  mocks.sport = "bike"; mocks.point = { ctl: 40, atl: 45, tsb: -5, date: "2026-10-14", dailyLoad: 0 }; mocks.canonical = true; mocks.launcher = [];
  mocks.state = { decision: null, loading: false, unavailable: true, unavailableReason: "disabled", scheduledOnly: true, refresh: vi.fn() };
});
afterEach(cleanup);
function renderToday() { render(<MemoryRouter><CoachTodayPage /></MemoryRouter>); }

describe("오늘 훈련 — 계획 · AI 코치 분석 요청 · 24/48시간 변화만", () => {
  it("예정 운동이 없더라도 서버 예측 없이 휴식 수치를 만들지 않는다", () => {
    mocks.state = { ...mocks.state, unavailable: false, unavailableReason: null, decision: decisionWith([]) };
    renderToday();
    const plan = screen.getByTestId("K2-2");
    expect(plan).toHaveAttribute("data-today-plan", "none");
    expect(within(plan).getByText("training:decision.noScheduled")).toBeInTheDocument();
    expect(screen.queryByTestId("K2-1-2")).not.toBeInTheDocument();
    expect(screen.getByText("today.forecastUnavailable")).toBeInTheDocument();
  });

  it("예정 운동은 표시하되 서버 예측 없이 TSS로 지표를 계산하지 않는다", () => {
    mocks.state = { ...mocks.state, unavailable: false, unavailableReason: null, decision: decisionWith([session("z2", 60)]) };
    renderToday();
    expect(screen.getByTestId("K2-2")).toHaveAttribute("data-today-plan", "scheduled");
    expect(screen.getByTestId("K2-2-1")).toBeInTheDocument();
    expect(screen.queryByTestId("K2-1-2")).not.toBeInTheDocument();
    expect(screen.getByText("today.forecastUnavailable")).toBeInTheDocument();
  });

  it("대표 휴식과 다른 운동·미확정 TSS가 섞여도 휴식 예측을 만들지 않는다", () => {
    mocks.state = { ...mocks.state, unavailable: false, unavailableReason: null,
      decision: decisionWith([session("rest", 0), { ...session("z2", 60), sessionId: "s2" }, { ...session("z2", null), sessionId: "s3" }]) };
    renderToday();
    expect(screen.queryByTestId("K2-1-2")).not.toBeInTheDocument();
    expect(screen.queryByText("today.forecastBasisRest")).not.toBeInTheDocument();
    expect(screen.getByText("today.forecastUnavailable")).toBeInTheDocument();
  });

  it("순서는 계획 → AI 코치에게 분석 요청 → 24/48시간 변화이고 다른 것은 없다", () => {
    mocks.state = { ...mocks.state, unavailable: false, unavailableReason: null, decision: decisionWith([session("z2", 60)]) };
    renderToday();
    const plan = screen.getByTestId("K2-2");
    const ask = screen.getByTestId("K2-5");
    const forecast = screen.getByTestId("K2-1");
    expect(plan.compareDocumentPosition(ask) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ask.compareDocumentPosition(forecast) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(ask).getByRole("button", { name: "training:decision.askCoach" })).toBeInTheDocument();
    // 권고 근거가 없으면 일반 질문으로 연다.
    expect(mocks.launcher.at(-1)?.progressPlannerSelection).toBeNull();
    // 간단 운동 고르기·운동 보내기·변경 적용은 없다.
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByTestId("K2-3")).not.toBeInTheDocument();
    expect(screen.queryByTestId("K2-2-4")).not.toBeInTheDocument();
  });

  it("조회 실패면 계획 자리에 안내 한 줄만 두고 다시 확인 버튼은 없다", () => {
    mocks.state = { ...mocks.state, unavailableReason: "error" };
    renderToday();
    expect(screen.getByTestId("K2-2")).toHaveAttribute("data-today-plan", "error");
    expect(screen.getByText("training:decision.fallback.unavailableBody")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "training:decision.refresh" })).not.toBeInTheDocument();
  });

  it.each(["error", "disabled", null] as const)("계획을 확인하지 못하면 예정 없음이나 휴식 예측으로 바꾸지 않는다 %s", (reason) => {
    mocks.state = { ...mocks.state, decision: null, unavailable: reason !== null, unavailableReason: reason };
    renderToday();
    expect(screen.getByText("training:decision.fallback.unavailableBody")).toBeInTheDocument();
    expect(screen.queryByText("training:decision.noScheduled")).not.toBeInTheDocument();
    expect(screen.queryByText("today.forecastBasisRest")).not.toBeInTheDocument();
    expect(screen.queryByTestId("K2-1-2")).not.toBeInTheDocument();
    expect(screen.getByText("today.forecastPlanUnavailable")).toBeInTheDocument();
  });

  it("건강 신호로 운동 중단이면 경고를 계획 카드에 보인다", () => {
    mocks.state = { ...mocks.state, unavailable: false, unavailableReason: null, decision: decisionWith([session("z2", 60)], "stop") };
    renderToday();
    expect(screen.getByTestId("K2-2-3")).toBeInTheDocument();
  });

  it("정본 부하가 없으면 변화를 지어내지 않는다", () => {
    mocks.point = null; mocks.canonical = false;
    mocks.state = { ...mocks.state, unavailable: false, decision: decisionWith([]) }; renderToday();
    expect(screen.queryByTestId("K2-1-2")).not.toBeInTheDocument();
    expect(screen.getByText("today.forecastUnavailable")).toBeInTheDocument();
  });

  it("예정 운동에 TSS 가 없으면 계산할 수 없다고 말한다", () => {
    mocks.state = { ...mocks.state, unavailable: false, unavailableReason: null, decision: decisionWith([session("z2", null)]) };
    renderToday();
    expect(screen.queryByTestId("K2-1-2")).not.toBeInTheDocument();
    expect(screen.getByText("today.forecastUnavailable")).toBeInTheDocument();
  });
});
