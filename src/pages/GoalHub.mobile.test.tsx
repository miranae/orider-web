import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { getDoc, updateDoc } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { planWeekPosition } from "./GoalHubMobile";
import GoalHub from "./GoalHub";

const DAY = 86400000;
const state = vi.hoisted(() => ({ goal: null as null | Record<string, unknown>, sport: "bike", weeks: [] as unknown[], loading: false, cacheHit: false, freshLoaded: true as boolean }));
const confirm = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../contexts/DialogContext", () => ({ useDialog: () => ({ confirm }) }));
vi.mock("../hooks/usePlanModel", () => ({ usePlanModel: () => ({ user: { uid: "owner" }, goal: state.goal, discipline: state.sport, loading: state.loading, loadError: null, freshLoaded: state.freshLoaded, cacheHit: state.cacheHit, goalMatchesDiscipline: true, weeks: state.weeks, retryLoad: vi.fn() }) }));
vi.mock("./ClimbGoalSetupPage", () => ({ default: () => <div>climb form</div> }));

function week(index: number, startMs: number) {
  return { id: `week-${index + 1}`, weekNumber: index + 1, phase: "build", startDate: startMs, plannedTSS: 0, days: Array.from({ length: 7 }, (_, day) => ({ date: startMs + day * DAY })) };
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation(query => ({ matches: query.includes("max-width"), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
  state.goal = null; state.sport = "bike"; state.weeks = []; state.loading = false; state.cacheHit = false; state.freshLoaded = true;
  confirm.mockClear();
});

describe("phone goal tab", () => {
  it("shows date, name, stored target values, plan weeks and the plan button in order without load notices", () => {
    const now = Date.now();
    state.goal = { id: "g", title: "가을 그란폰도", discipline: "bike", eventType: "time", eventDate: now + 27 * DAY, courseDist: 128, courseElev: 2140, targetDurationMin: 330,
      planInputSources: { ftpSource: "assumed", weightSource: "assumed" } };
    state.weeks = Array.from({ length: 16 }, (_, index) => week(index, now - 8 * 7 * DAY + index * 7 * DAY - DAY));
    renderWithProviders(<GoalHub wizard={<div>event wizard</div>} />, { route: "/ko/coach/goals?sport=bike" });
    const card = screen.getByTestId("K3-1");
    expect(within(card).getByTestId("K3-1-1")).toHaveTextContent("D−27");
    expect(within(card).getByRole("heading", { name: "가을 그란폰도" })).toBeVisible();
    const tiles = within(card).getByTestId("K3-1-6");
    expect(tiles).toHaveTextContent("거리128km"); expect(tiles).toHaveTextContent("상승2,140m"); expect(tiles).toHaveTextContent("목표 기록5:30");
    expect(within(card).getByTestId("K3-1-7")).toHaveTextContent("9 / 16주");
    expect(within(card).getByRole("link", { name: "계획 보기" })).toHaveAttribute("href", "/ko/coach/plan?sport=bike");
    // CTL·TSB·부하 요약·입력 출처 안내는 휴대폰 카드에 없다.
    expect(card).not.toHaveTextContent(/CTL|TSB|목표기간 훈련 부하/);
    expect(screen.queryByTestId("goal-input-source")).not.toBeInTheDocument();
    expect(screen.queryByTestId("K3-1-2")).not.toBeInTheDocument();
    expect(getDoc).not.toHaveBeenCalledWith(expect.objectContaining({ path: "users/owner/fitness/projection_bike" }));
    // 다른 목표 유형은 처음에 접혀 있다.
    expect(screen.queryByTestId("K3-2")).not.toBeInTheDocument();
    expect(screen.queryByText("다른 목표를 세우려면")).not.toBeInTheDocument();
  });

  it("omits plan weeks when today is outside the stored plan and shows only stored values", () => {
    const now = Date.now();
    state.goal = { id: "g", title: "Climb", goalType: "climb", eventDate: now + 40 * DAY, courseDist: 0, target: { climbDurationMin: 42, targetWkg: 3.4 } };
    state.weeks = [week(0, now + 14 * DAY)];
    renderWithProviders(<GoalHub wizard={<div />} />);
    expect(screen.getByTestId("K3-1-6")).toHaveTextContent("목표 기록0:42");
    expect(screen.getByTestId("K3-1-6")).toHaveTextContent("목표 W/kg3.4W/kg");
    expect(screen.getByTestId("K3-1-6")).not.toHaveTextContent("거리");
    expect(screen.queryByTestId("K3-1-7")).not.toBeInTheDocument();
    expect(planWeekPosition([], now)).toBeNull();
  });

  it("reduces the saved-info notice to one chip", () => {
    state.goal = { id: "g", title: "Saved goal", eventDate: Date.now() + DAY };
    state.cacheHit = true; state.freshLoaded = false;
    renderWithProviders(<GoalHub wizard={<div />} />);
    expect(screen.getByTestId("K3-1-1")).toHaveTextContent("이전 정보");
    expect(screen.queryByText("저장된 이전 정보를 표시하고 있습니다.")).not.toBeInTheDocument();
  });

  it("opens type rows from 목표 변경 and keeps the replacement notice to one line", () => {
    state.goal = { id: "g", title: "Winter course", eventDate: Date.now() + 30 * DAY };
    renderWithProviders(<GoalHub wizard={<div>event wizard</div>} />, { route: "/ko/coach/goals?sport=bike" });
    const change = screen.getByTestId("K3-1-4");
    expect(change).toHaveAccessibleName("목표 변경"); expect(change).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(change);
    expect(change).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByTestId("K3-2-1"));
    expect(screen.getByText("event wizard")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("시작하면 'Winter course' 목표는 포기됩니다.");
    fireEvent.click(screen.getByTestId("K3-2-2"));
    expect(screen.getByText("climb form")).toBeInTheDocument();
  });

  it("abandons through the existing confirmation", async () => {
    state.goal = { id: "g", title: "Winter course", eventDate: Date.now() + 30 * DAY };
    vi.mocked(updateDoc).mockResolvedValueOnce(undefined);
    renderWithProviders(<GoalHub wizard={<div />} />);
    fireEvent.click(screen.getByTestId("K3-1-5"));
    await waitFor(() => expect(updateDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "abandoned" })));
    expect(confirm).toHaveBeenCalledWith("이 운동 목표를 포기하시겠습니까? 기록은 유지됩니다.", { destructive: true });
  });

  it("goes straight to type rows when there is no goal, for both sports", () => {
    renderWithProviders(<GoalHub wizard={<div />} />, { route: "/ko/coach/goals?sport=bike" });
    expect(screen.queryByTestId("K3-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("K3-2-1")).toHaveTextContent("대회·코스 완주날짜와 거리");
    expect(screen.getByTestId("K3-2-2")).toHaveTextContent("코스와 시간");
  });

  it("lists the running race and program rows", () => {
    state.sport = "run";
    renderWithProviders(<GoalHub wizard={<div>run wizard</div>} />, { route: "/ko/coach/goals?sport=run" });
    fireEvent.click(screen.getByTestId("K3-2-3"));
    expect(screen.getByText("run wizard")).toBeInTheDocument();
    expect(screen.getByTestId("K3-2-program")).toHaveAttribute("href", "/ko/coach/plan?sport=run");
  });

  it("keeps a running program without an abandon row", () => {
    state.sport = "run";
    state.goal = { id: "run", title: "30분 달리기", runProgram: { week: 1 } };
    renderWithProviders(<GoalHub wizard={<div />} />);
    expect(screen.queryByTestId("K3-1-5")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("K3-1-4"));
    expect(screen.queryByTestId("K3-2-program")).not.toBeInTheDocument();
  });

  it("disables replacement rows before the goal state is confirmed", () => {
    state.loading = true;
    renderWithProviders(<GoalHub wizard={<div />} />);
    expect(screen.getByTestId("K3-2-1")).toBeDisabled();
    expect(screen.getByTestId("K3-2-2")).toBeDisabled();
  });
});
