import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { setDocData } from "../__tests__/mocks/firebase";
import GoalHub from "./GoalHub";
const state = vi.hoisted(() => ({ goal: null as null | Record<string, unknown>, sport: "bike", user: { uid: "owner" } as { uid: string; isAnonymous?: boolean } | null }));
vi.mock("../hooks/usePlanModel", () => ({ usePlanModel: () => ({ user: state.user, goal: state.goal, discipline: state.sport, loading: false, loadError: null, progress: 12, weeks: [], daysLeft: 30, goalDate: new Date("2026-12-01"), retryLoad: vi.fn() }) }));
vi.mock("./ClimbGoalSetupPage", () => ({ default: () => <div>climb form</div> }));
beforeEach(() => { state.goal = null; state.sport = "bike"; state.user = { uid: "owner" }; });
describe("goal hub", () => {
  it("shows the existing goal before type selection and opens the wizard only after choosing", () => {
    state.goal = { id: "g", title: "Winter course", courseName: "Course", eventType: "completion" };
    renderWithProviders(<GoalHub wizard={<div>event wizard</div>} />, { route: "/ko/coach/goals?sport=bike" });
    expect(screen.getByTestId("K3-1-1")).toHaveTextContent("Winter course");
    expect(screen.getByRole("button", { name: "목표 포기" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "계획 보기 →" })).toHaveAttribute("href", "/ko/coach/plan?sport=bike");
    expect(screen.queryByText("event wizard")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "대회·코스 완주" }));
    expect(screen.getByText("event wizard")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Winter course");
  });
  it("shows server goal-day projection only when its goal identity matches", async () => {
    state.goal = { id: "g", title: "Projection goal", eventType: "completion" };
    setDocData("users/owner/fitness/projection_bike", { goalId: "g", discipline: "bike", goalDay: { ctl: 42, tsb: 5 } });
    renderWithProviders(<GoalHub wizard={<div>event wizard</div>} />);
    expect(await screen.findByText("CTL 42.0 · TSB 5.0")).toBeInTheDocument();
  });
  it("offers run race and program routes without a bike wizard", () => {
    state.sport = "run";
    renderWithProviders(<GoalHub wizard={<div>run wizard</div>} />, { route: "/ko/coach/goals?sport=run&new=1" });
    expect(screen.getByRole("button", { name: "러닝 대회" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "30분 달리기 프로그램" })).toHaveAttribute("href", "/ko/coach/plan?sport=run");
    expect(screen.queryByRole("button", { name: "대회·코스 완주" })).not.toBeInTheDocument();
  });
  it("requires sign-in for anonymous identities before type selection", () => {
    state.user = { uid: "anonymous", isAnonymous: true };
    renderWithProviders(<GoalHub wizard={<div>event wizard</div>} />);
    expect(screen.getByTestId("K3-2-5")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "대회·코스 완주" })).not.toBeInTheDocument();
  });
  it("keeps guests out of the type picker and wizard", () => {
    state.user = null;
    renderWithProviders(<GoalHub wizard={<div>event wizard</div>} />);
    expect(screen.getByTestId("K3-2-5")).toBeInTheDocument();
    expect(screen.queryByTestId("K3-2")).not.toBeInTheDocument();
  });
});
