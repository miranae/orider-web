import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: { uid: "owner", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null, enabled: true, callable: vi.fn(), goal: null as null | { id: string; title: string; eventDate: number }, snapshot: vi.fn(), projection: null as null | { goalId: string; goalDay: {ctl: number} } }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("../../hooks/useTodayTrainingDecision", () => ({ useTodayTrainingDecision: () => ({ loading: false, decision: { scheduledProjectionValidUntil: Date.now() + 60000, representativeSessionId: "session", effectiveSessions: [{ sessionId: "session", current: { workout: "easy", durationMin: 30 } }] } }) }));
vi.mock("../../services/runtimeConfig", () => ({ getRuntimeConfig: () => ({ trainingDecisionEnabled: mocks.enabled }) }));
vi.mock("../../services/firebase", () => ({ firestore: {}, functions: {}, ensureAppCheckReady: () => Promise.resolve() }));
vi.mock("../../services/errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: (_functions: unknown, name: string) => { mocks.callable(name); return async () => ({ data: { events: [5, 1, 4, 2, 3].map((day) => ({ eventId: `e${day}`, name: `Event ${day}`, startTime: Date.now() + day * 86400000 })) } }); } }));
vi.mock("firebase/firestore", () => ({ doc: (_db: unknown, ...parts: string[]) => ({path: parts.join("/")}), collection: vi.fn(), query: vi.fn(), where: vi.fn(), limit: vi.fn(), onSnapshot: (ref: {path?: string} | undefined, callback: (value: unknown) => void) => { mocks.snapshot(ref?.path); callback(ref?.path ? {data: () => mocks.projection} : { docs: mocks.goal ? [{ id: mocks.goal.id, data: () => mocks.goal }] : [] }); return vi.fn(); } }));
import HomeTodayStrip from "./HomeTodayStrip";
const props = { discipline: "bike" as const, fitness: { ctl: 20, atl: 30, tsb: -10 }, weeklyDetails: null, weeklySummary: "Week data", monthlyKm: 100, weeklyAverageKm: 50, guidance: "Guide" };
describe("home today strip", () => {
  beforeEach(() => { mocks.user = { uid: "owner", isAnonymous: false }; mocks.enabled = true; mocks.goal = null; mocks.projection = null; vi.clearAllMocks(); });
  it("shows five read-only slots, three earliest registered events and coach decision link", async () => {
    const { container } = render(<MemoryRouter><HomeTodayStrip {...props} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/Event 1/)).toBeTruthy());
    expect(container.querySelectorAll("[data-home-slot]")).toHaveLength(5);
    expect(screen.queryByText(/Event 4/)).toBeNull();
    expect(mocks.callable.mock.calls).toEqual([["listMyRegisteredEvents"]]);
    expect(screen.getByRole("link", { name: "정하기 →" }).getAttribute("href")).toContain("/coach/today?sport=bike");
    expect(screen.queryByRole("button")).toBeNull();
    expect(mocks.snapshot.mock.calls.some(([path]) => path?.includes("projection"))).toBe(false);
    expect(screen.getByRole("link", { name: /이번 주/ }).getAttribute("href")).toContain("/athlete/me/activities");
  });
  it("hides today's decision when rollout is disabled and folds extra mobile slots", () => {
    mocks.enabled = false;
    const { container } = render(<MemoryRouter><HomeTodayStrip {...props} mobile /></MemoryRouter>);
    expect(container.querySelector('[data-home-slot="today"]')).toBeNull();
    expect(container.querySelector('details [data-home-slot="events"]')).toBeTruthy();
    expect(container.querySelector('details [data-home-slot="guidance"]')).toBeTruthy();
  });
  it("uses goal-day CTL only for the active goal's matching projection", async () => {
    mocks.goal = { id: "g1", title: "Event goal", eventDate: Date.now() + 86400000 };
    mocks.projection = {goalId: "g1", goalDay: {ctl: 42}};
    const { rerender } = render(<MemoryRouter><HomeTodayStrip {...props} /></MemoryRouter>);
    expect(await screen.findByText("목표일 예상 CTL 42.0")).toBeTruthy();
    expect(mocks.snapshot).toHaveBeenCalledWith("users/owner/fitness/projection_bike");
    mocks.user = {uid: "other", isAnonymous: false};
    mocks.projection = {goalId: "old-goal", goalDay: {ctl: 99}};
    rerender(<MemoryRouter><HomeTodayStrip {...props} /></MemoryRouter>);
    expect(screen.queryByText(/목표일 예상 CTL/)).toBeNull();
  });
  it("uses the selected run sport for condition and today, and shows run recap instead of a cycling-style monthly goal", () => {
    mocks.goal = { id: "g", title: "Should not show monthly goal", eventDate: Date.now() + 86400000 };
    render(<MemoryRouter><HomeTodayStrip {...props} discipline="run" runningRecap={<p>Last week running recap</p>} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "컨디션 보기 →" })).toHaveAttribute("href", "/ko/coach/condition?sport=run");
    expect(screen.getByRole("link", { name: "정하기 →" })).toHaveAttribute("href", "/ko/coach/today?sport=run");
    expect(screen.getByTestId("H2-3-4")).toHaveTextContent("Last week running recap");
    expect(screen.queryByText("Should not show monthly goal")).not.toBeInTheDocument();
  });
  it("keeps combined condition values linked to the all-sport condition reader without changing today's sport", () => {
    render(<MemoryRouter><HomeTodayStrip {...props} mobile conditionDiscipline="tri" fitness={{ ctl: 90, atl: 100, tsb: -10 }} /></MemoryRouter>);
    const condition = screen.getByTestId("H2-1-1");
    expect(condition).toHaveTextContent("CTL 90.0 · ATL 100.0 · TSB -10.0");
    const path = screen.getByRole("link", { name: "컨디션 보기 →" }).getAttribute("href")!;
    expect(path).toBe("/ko/coach/condition?sport=tri");
    expect(screen.getByRole("link", { name: "정하기 →" })).toHaveAttribute("href", "/ko/coach/today?sport=bike");
  });
  it("does not query personal data for guests", () => {
    mocks.user = null;
    const { container } = render(<MemoryRouter><HomeTodayStrip {...props} /></MemoryRouter>);
    expect(container.querySelector('[data-testid="home-today-strip"]')).toBeNull();
    expect(mocks.callable).not.toHaveBeenCalled();
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
});
