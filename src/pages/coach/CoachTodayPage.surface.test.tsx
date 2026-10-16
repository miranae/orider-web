import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TodayTrainingDecisionState } from "../../hooks/useTodayTrainingDecision";
import CoachTodayPage from "./CoachTodayPage";
const mocks = vi.hoisted(() => ({
  state: { decision: null, loading: false, unavailable: true, unavailableReason: "disabled", scheduledOnly: true, refresh: vi.fn() } as TodayTrainingDecisionState,
  sport: "bike", point: { ctl: 40, atl: 45, tsb: -5, date: "2026-10-14", dailyLoad: 0 } as Record<string, unknown> | null,
  canonical: true,
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../services/runtimeConfig", () => ({ getRuntimeConfig: () => ({ riderWorkoutDeliveryEnabled: false }) }));
vi.mock("../../components/LocalizedLink", () => ({ LocalizedLink: ({ to, children, ...props }: { to: string; children: React.ReactNode; "aria-label"?: string }) => <a href={to} {...props}>{children}</a> }));
vi.mock("../../components/redesign/DisciplineTabs", () => ({ default: () => <div>sport tabs</div> }));
vi.mock("./CoachFitnessLayout", () => ({ useCoachFitnessModel: () => ({ t: (key: string) => key,
  user: { uid: "owner" }, discipline: mocks.sport, currentPoint: mocks.point, i18n: { language: "ko" },
  hasCanonicalTimeseries: mocks.canonical, fitnessData: [], disciplineActivities: [], loading: false, timeseriesLoaded: true, error: null,
}) }));
vi.mock("../../features/fitness/components/FitnessCoachBriefing", () => ({ default: (props: { choiceTitle: string; deliveryEnabled: boolean; forecast: unknown }) => <section data-testid="chooser" data-delivery={String(props.deliveryEnabled)} data-forecast={String(Boolean(props.forecast))}>{props.choiceTitle}</section> }));
vi.mock("../../features/trainingDecision/TodayTrainingDecisionCard", () => ({
  TodayTrainingDecisionSource: ({ children }: { children: (state: TodayTrainingDecisionState) => React.ReactNode }) => children(mocks.state),
  default: () => <section data-testid="decision">decision</section>,
}));
vi.mock("../../features/training/run30/useRun30Program", () => ({ useRun30Program: () => ({ status: "ready", program: null }) }));
beforeEach(() => {
  mocks.sport = "bike"; mocks.point = { ctl: 40, atl: 45, tsb: -5, date: "2026-10-14", dailyLoad: 0 }; mocks.canonical = true;
  mocks.state = { decision: null, loading: false, unavailable: true, unavailableReason: "disabled", scheduledOnly: true, refresh: vi.fn() };
});
afterEach(cleanup);
function renderToday() { render(<MemoryRouter><CoachTodayPage /></MemoryRouter>); }
describe("today read-only chooser versus guarded writes", () => {
  it("shows chooser and forecast with decision disabled and hides writes", () => {
    renderToday();
    expect(screen.getByTestId("chooser")).toHaveAttribute("data-forecast", "true");
    expect(screen.getByTestId("chooser")).toHaveAttribute("data-delivery", "false");
    expect(screen.queryByTestId("decision")).not.toBeInTheDocument();
    expect(screen.getByText("today.decisionUnavailable")).toBeInTheDocument();
    const conditionLinks = screen.getAllByRole("link", { name: /coach.metric.tsb/ });
    expect(conditionLinks).toHaveLength(1);
    expect(conditionLinks[0]).toHaveAttribute("href", "/coach/condition?sport=bike");
    expect(conditionLinks[0].closest("header")).not.toBeNull();
  });
  it("keeps chooser first on lookup failure with the retry error card after it", () => {
    mocks.state.unavailableReason = "error"; renderToday();
    expect(screen.getByTestId("chooser").compareDocumentPosition(screen.getByTestId("decision")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("keeps choice available without inventing a fitness forecast when no data exists", () => {
    mocks.point = null; mocks.canonical = false; renderToday();
    expect(screen.getByTestId("chooser")).toHaveAttribute("data-forecast", "false");
    expect(screen.getByTestId("chooser")).toHaveAttribute("data-delivery", "false");
  });
  it("puts the decision first with a scheduled plan and labels the separate lighter workout", () => {
    mocks.state.decision = { scheduledSessions: [{}], healthGate: { state: "clear" } } as never;
    renderToday();
    expect(screen.getByTestId("decision").compareDocumentPosition(screen.getByTestId("chooser")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("chooser")).toHaveTextContent("today.planAlternative");
  });
  it("suppresses the choice on an authoritative health stop but keeps the warning card", () => {
    mocks.state.decision = { scheduledSessions: [], healthGate: { state: "stop" } } as never;
    renderToday(); expect(screen.queryByTestId("chooser")).not.toBeInTheDocument(); expect(screen.getByTestId("decision")).toBeInTheDocument();
  });
  it("shows the running program link even when today decision is disabled", () => {
    mocks.sport = "run"; renderToday();
    expect(screen.getByRole("link", { name: "today.runProgramLink" })).toHaveAttribute("href", "/coach/plan?sport=run");
  });
});
