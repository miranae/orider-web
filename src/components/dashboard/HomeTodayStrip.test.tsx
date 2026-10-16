import { GlossaryProvider } from "../common/GlossaryProvider";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: { uid: "owner", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null, enabled: true, eventsFailed: false, goalsFailed: false, decisionFailed: false, callable: vi.fn(), goal: null as null | { id: string; title: string; eventDate: number }, snapshot: vi.fn(), projection: null as null | {goalId: string; goalDay: {ctl: number}} }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("../../hooks/useTodayTrainingDecision", () => ({ useTodayTrainingDecision: () => ({ loading: false, unavailable: mocks.decisionFailed, decision: mocks.decisionFailed ? null : { scheduledProjectionValidUntil: Date.now() + 60000, representativeSessionId: "session", effectiveSessions: [{ sessionId: "session", current: { workout: "easy", durationMin: 30 } }] } }) }));
vi.mock("../../services/runtimeConfig", () => ({ getRuntimeConfig: () => ({ trainingDecisionEnabled: mocks.enabled }) }));
vi.mock("../../services/firebase", () => ({ firestore: {}, functions: {}, ensureAppCheckReady: () => Promise.resolve() }));
vi.mock("../../services/errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: (_functions: unknown, name: string) => { mocks.callable(name); return async () => { if (mocks.eventsFailed) throw new Error("events unavailable"); return ({ data: { events: [5, 1, 4, 2, 3].map((day) => ({ eventId: `e${day}`, name: `Event ${day}`, startTime: Date.now() + day * 86400000 })) } }); }; } }));
vi.mock("firebase/firestore", () => ({ doc: (_db: unknown, ...parts: string[]) => ({path: parts.join("/")}), collection: vi.fn(), query: vi.fn(), where: vi.fn(), limit: vi.fn(), onSnapshot: (ref: {path?: string} | undefined, callback: (value: unknown) => void, onError: (error: Error) => void) => { mocks.snapshot(ref?.path); if (ref?.path) { callback({data: () => mocks.projection}); return vi.fn(); } if (mocks.goalsFailed) { onError(new Error("goals unavailable")); return vi.fn(); } callback({ docs: mocks.goal ? [{ id: mocks.goal.id, data: () => mocks.goal }] : [] }); return vi.fn(); } }));
import HomeTodayStrip from "./HomeTodayStrip";
const props = { discipline: "bike" as const, fitness: { ctl: 20, atl: 30, tsb: -10 }, weeklyDetails: null, weeklySummary: "Week data", monthlyKm: 100, weeklyAverageKm: 50, guidance: "Guide" };
describe("home today strip", () => {
  beforeEach(() => { mocks.user = { uid: "owner", isAnonymous: false }; mocks.enabled = true; mocks.eventsFailed = false; mocks.goalsFailed = false; mocks.decisionFailed = false; mocks.goal = null; mocks.projection = null; vi.clearAllMocks(); });
  it("keeps goal recovery scoped to running when the goal snapshot fails", () => {
    mocks.goalsFailed = true;
    render(<MemoryRouter><HomeTodayStrip {...props} discipline="run" /></MemoryRouter>);
    expect(screen.getByTestId("H2-3-3")).toHaveTextContent("잠시 불러올 수 없어요");
    expect(screen.getByRole("link", { name: "목표 보기 →" })).toHaveAttribute("href", "/ko/coach/goals?sport=run");
    expect(screen.queryByRole("link", { name: "목표 만들기 →" })).not.toBeInTheDocument();
  });
  it("distinguishes an unavailable decision from an empty successful day", () => {
    mocks.decisionFailed = true;
    render(<MemoryRouter><HomeTodayStrip {...props} /></MemoryRouter>);
    expect(screen.getByTestId("H2-2-1")).toHaveTextContent("잠시 불러올 수 없어요");
    expect(screen.getByTestId("H2-2-1")).not.toHaveTextContent("오늘 운동을 코치에서 정해보세요");
  });
  it.each(["bike", "swim"] as const)("labels goal-less monthly totals as all sports while retaining %s goal creation", async (discipline) => {
    render(<MemoryRouter><HomeTodayStrip {...props} discipline={discipline} monthlyFlowPercent={46} /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "이번 달 활동 · 전체 종목" })).toBeInTheDocument();
    expect(screen.getByTestId("H2-3-3")).toHaveTextContent("평소 월간 거리 대비 46%");
    expect(screen.getByRole("link", { name: "분석 보기 →" })).toHaveAttribute("href", "/ko/coach/analysis?sport=tri");
    expect(screen.getByRole("link", { name: "목표 만들기 →" })).toHaveAttribute("href", `/ko/coach/goals?sport=${discipline}`);
  });
  it("shows separate read-only slots, three earliest registered events and coach decision link", async () => {
    const { container } = render(<MemoryRouter><GlossaryProvider><HomeTodayStrip {...props} /></GlossaryProvider></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/Event 1/)).toBeTruthy());
    expect(container.querySelectorAll("[data-home-slot]")).toHaveLength(5);
    expect(screen.queryByText(/Event 4/)).toBeNull();
    expect(mocks.callable.mock.calls).toEqual([["listMyRegisteredEvents"]]);
    expect(mocks.snapshot.mock.calls.some(([path]) => path?.includes("projection"))).toBe(false);
    expect(screen.getByRole("link", { name: "정하기 →" }).getAttribute("href")).toContain("/coach/today?sport=bike");
    expect(screen.getAllByRole("button").every(button => button.getAttribute("aria-label")?.includes("설명"))).toBe(true);
  });
  it("keeps desktop activity figures in the main summary and separates history, load and goal cards", () => {
    const { container } = render(<MemoryRouter><GlossaryProvider><HomeTodayStrip {...props} weeklyDetails={<section>Weekly TSS</section>} conditionSummary={<p>Fitness calculation pending</p>} /></GlossaryProvider></MemoryRouter>);
    expect(screen.queryByText("Week data")).not.toBeInTheDocument();
    expect(screen.queryByTestId("H2-3-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("H2-1-1")).toHaveTextContent("Fitness calculation pending");
    expect(screen.getByText("Weekly TSS").closest("[data-home-slot]")).toBeNull();
    expect(screen.getByTestId("H2-3-3").closest("[data-home-slot]")).toBe(container.querySelector('[data-home-slot="goal"]'));

  });
  it("preserves the sole mobile activity summary outside folded extra slots", () => {
    render(<MemoryRouter><GlossaryProvider><HomeTodayStrip {...props} mobile thresholdSummary="FTP 200 W" /></GlossaryProvider></MemoryRouter>);
    expect(screen.queryByText("FTP 200 W")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "내 최근 7일 · 사이클" })).toBeInTheDocument();
    expect(screen.getByText("Week data").closest("details")).toBeNull();
    expect(screen.getByTestId("H2-3-1")).toHaveTextContent("Week data");
  });
  it("hides today's decision when rollout is disabled and folds extra mobile slots", () => {
    mocks.enabled = false;
    const { container } = render(<MemoryRouter><GlossaryProvider><HomeTodayStrip {...props} mobile /></GlossaryProvider></MemoryRouter>);
    expect(container.querySelector('[data-home-slot="today"]')).toBeNull();
    expect(container.querySelector('details [data-home-slot="events"]')).toBeTruthy();
    expect(container.querySelector('details [data-home-slot="guidance"]')).toBeTruthy();
  });
  it("offers event discovery after registered schedules fail to load", async () => {
    mocks.eventsFailed = true;
    render(<MemoryRouter><GlossaryProvider><HomeTodayStrip {...props} /></GlossaryProvider></MemoryRouter>);
    expect(await screen.findByRole("link", { name: "일정 찾기 →" })).toHaveAttribute("href", "/ko/explore/events");
  });
  it("uses goal-day CTL only for the active goal's matching projection", async () => {
    mocks.goal = { id: "g1", title: "Event goal", eventDate: Date.now() + 86400000 };
    mocks.projection = {goalId: "g1", goalDay: {ctl: 42}};
    const { rerender } = render(<MemoryRouter><GlossaryProvider><HomeTodayStrip {...props} /></GlossaryProvider></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId("H2-3-3")).toHaveTextContent("목표일 예상 CTL 42.0"));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "CTL 설명" })).toHaveLength(2));
    expect(mocks.snapshot).toHaveBeenCalledWith("users/owner/fitness/projection_bike");
    mocks.user = {uid: "other", isAnonymous: false};
    mocks.projection = {goalId: "old-goal", goalDay: {ctl: 99}};
    rerender(<MemoryRouter><GlossaryProvider><HomeTodayStrip {...props} /></GlossaryProvider></MemoryRouter>);
    expect(screen.getByTestId("H2-3-3")).not.toHaveTextContent("목표일 예상 CTL");
  });
  it("explains fitness terms while preserving a user-written goal title", async () => {
    mocks.goal = { id: "g1", title: "FTP_NP_사용자 목표", eventDate: Date.now() + 86400000 };
    render(<MemoryRouter><GlossaryProvider><HomeTodayStrip {...props} /></GlossaryProvider></MemoryRouter>);
    expect(await screen.findByText("FTP_NP_사용자 목표")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CTL 설명" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "FTP 설명" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "NP 설명" })).not.toBeInTheDocument();
  });
  it("uses the selected run sport for condition and today, keeps run goals alongside the recap", () => {
    mocks.goal = { id: "g", title: "Should not show monthly goal", eventDate: Date.now() + 86400000 };
    render(<MemoryRouter><GlossaryProvider><HomeTodayStrip {...props} discipline="run" runningRecap={<p>Last week running recap</p>} /></GlossaryProvider></MemoryRouter>);
    expect(screen.getByRole("link", { name: "컨디션 보기 →" })).toHaveAttribute("href", "/ko/coach/condition?sport=run");
    expect(screen.getByRole("link", { name: "정하기 →" })).toHaveAttribute("href", "/ko/coach/today?sport=run");
    expect(screen.getByTestId("H2-3-4")).toHaveTextContent("Last week running recap");
    expect(screen.getByText("Should not show monthly goal")).toBeInTheDocument();
  });
  it("keeps a run goal visible when the recap is absent", () => {
    mocks.goal = { id: "run-goal", title: "Half marathon", eventDate: Date.now() + 86400000 };
    render(<MemoryRouter><HomeTodayStrip {...props} mobile discipline="run" runningRecap={null} /></MemoryRouter>);
    expect(screen.getByText("Half marathon")).toBeInTheDocument();
    expect(screen.queryByTestId("H2-3-4")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "목표 보기 →" })).toHaveAttribute("href", "/ko/coach/goals?sport=run");
  });
  it("keeps goal-less run monthly data and analysis scoped to running", () => {
    render(<MemoryRouter><HomeTodayStrip {...props} discipline="run" monthlyFlowPercent={40} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "이번 달 흐름 · 러닝" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "분석 보기 →" })).toHaveAttribute("href", "/ko/coach/analysis?sport=run");
    expect(screen.getByRole("link", { name: "목표 만들기 →" })).toHaveAttribute("href", "/ko/coach/goals?sport=run");
  });
  it("prioritizes desktop running condition and goal before recap, history and supporting detail", () => {
    mocks.goal = { id: "g", title: "Run goal", eventDate: Date.now() + 86400000 };
    render(<MemoryRouter><HomeTodayStrip {...props} discipline="run" runningRecap={<p>Run recap</p>} weeklyDetails={<p>Run weeks</p>} secondaryDetails={<section data-testid="supporting-detail">Cross-sport load</section>} /></MemoryRouter>);
    const condition = screen.getByTestId("H2-1-1");
    const goal = screen.getByTestId("H2-3-3");
    const recap = screen.getByTestId("H2-3-4");
    const history = screen.getByTestId("H2-3-2");
    const supporting = screen.getByTestId("supporting-detail");
    for (const [before, after] of [[condition, goal], [goal, recap], [recap, history], [history, supporting]]) {
      expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
  it("keeps supporting running detail in the mobile secondary disclosure after primary goals and condition", () => {
    render(<MemoryRouter><HomeTodayStrip {...props} mobile discipline="run" secondaryDetails={<section>Cross-sport load</section>} /></MemoryRouter>);
    expect(screen.getByText("Cross-sport load").closest("details")).not.toBeNull();
    expect(screen.getByTestId("H2-3-3").closest("details")).toBeNull();
    expect(screen.getByTestId("H2-1-1").closest("details")).toBeNull();
  });
  it("keeps combined condition values linked to the all-sport condition reader without changing today's sport", () => {
    render(<MemoryRouter><GlossaryProvider><HomeTodayStrip {...props} mobile conditionDiscipline="tri" fitness={{ ctl: 90, atl: 100, tsb: -10 }} /></GlossaryProvider></MemoryRouter>);
    const condition = screen.getByTestId("H2-1-1");
    expect(screen.getByRole("heading", { name: "통합 · 컨디션" })).toBeInTheDocument();
    expect(condition).toHaveTextContent("CTL 90.0 · ATL 100.0 · TSB -10.0");
    const path = screen.getByRole("link", { name: "컨디션 보기 →" }).getAttribute("href")!;
    expect(path).toBe("/ko/coach/condition?sport=tri");
    expect(screen.getByRole("link", { name: "정하기 →" })).toHaveAttribute("href", "/ko/coach/today?sport=bike");
  });
  it.each(["bike", "run", "swim"] as const)("keeps canonical all-sport weekly summary linked to all sports from %s home", (discipline) => {
    render(<MemoryRouter><HomeTodayStrip {...props} mobile discipline={discipline} weeklyDiscipline="tri" /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "내 최근 7일 · 통합" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "월간 운동일지 →" })).toHaveAttribute("href", "/ko/athlete/me/activities?sport=all");
  });
  it("links a sport-specific weekly summary to the same sport even when today's decision differs", () => {
    render(<MemoryRouter><HomeTodayStrip {...props} mobile discipline="bike" weeklyDiscipline="run" /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "월간 운동일지 →" })).toHaveAttribute("href", "/ko/athlete/me/activities?sport=run");
  });
  it("does not query personal data for guests", () => {
    mocks.user = null;
    const { container } = render(<MemoryRouter><GlossaryProvider><HomeTodayStrip {...props} /></GlossaryProvider></MemoryRouter>);
    expect(container.querySelector('[data-testid="home-today-strip"]')).toBeNull();
    expect(mocks.callable).not.toHaveBeenCalled();
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
});
