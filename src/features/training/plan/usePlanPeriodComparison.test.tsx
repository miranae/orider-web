import { act, render, screen, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import PlanLoadComparison from "./PlanLoadComparisonPanel";
import PlanRecordEvidence from "./PlanRecordEvidence";
import { getDocs, where } from "firebase/firestore";
import type { Activity } from "@shared/types";
import type { PlanWeek } from "@shared/types/goal";
import { boundaryPlanWeeks, usePlanPeriodComparison } from "./usePlanPeriodComparison";
const context = vi.hoisted(() => ({ user: { uid: "owner", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null }));
vi.mock("../../../contexts/AuthContext", () => ({ useAuth: () => ({ user: context.user, loading: false }) }));
const db = {};
vi.mock("../../../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => ({ firestore: db }) }));
vi.mock("../../../services/errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("../../../hooks/useActivityRepresentatives", () => ({
  useActivityRepresentatives: () => ({ representatives: new Map(), loading: false, error: false, retry: vi.fn() }),
  withActivityRepresentatives: (rows: Activity[]) => rows,
}));
const ms = (date: string) => Date.parse(`${date}T00:00:00+09:00`);
const week: PlanWeek = { id: "w6", weekNumber: 6, phase: "base", startDate: ms("2026-10-05"), plannedTSS: 140,
  days: Array.from({ length: 7 }, (_, i) => ({ date: ms("2026-10-05") + i * 86400000, dayOfWeek: i, workout: "z2", plannedTSS: 20, plannedDurationMin: 30, completed: false, skipped: false })) };
const options = { uid: "owner", discipline: "bike" as const, weeks: [week], range: { start: "2026-10-09", end: "2026-10-11" } };
const ride = (id: string, date: string, tss: number | undefined, extra = {}): Activity => ({ id, userId: "owner", type: "Ride", source: "orider", startTime: ms(date) + 3600000, summary: { ridingTimeMillis: 0 }, tss, ...extra } as Activity);
type Snapshot = Awaited<ReturnType<typeof getDocs>>;
const page = (activities: Activity[], confirmed = true): Snapshot => ({ docs: activities.map(activity => ({ id: activity.id, data: () => activity })), metadata: { fromCache: !confirmed, hasPendingWrites: false } } as unknown as Snapshot);
beforeEach(() => { context.user = { uid: "owner", isAnonymous: false }; vi.mocked(getDocs).mockReset(); vi.mocked(where).mockClear(); });

it("keeps selected-period totals unchanged while attaching independently verified full-week evidence", async () => {
  vi.mocked(getDocs).mockResolvedValueOnce(page([ride("outside-selection", "2026-10-07", 200), ride("selected", "2026-10-10", 30)]))
    .mockResolvedValueOnce(page([ride("selected", "2026-10-10", 30)]));
  const h = renderHook(() => usePlanPeriodComparison(options));
  await waitFor(() => expect(h.result.current.parentWeeksPending).toBe(false));
  expect(h.result.current.summary).toMatchObject({ actualTss: 30, plannedTss: 60, ratioPct: 50 });
  expect(h.result.current.days[1]).toMatchObject({ actualTss: 30, fulfilledWeek: { weekNumber: 6, actualTss: 230, plannedTss: 140 } });
  expect(getDocs).toHaveBeenCalledTimes(2);
  expect(where).toHaveBeenCalledWith("startTime", ">=", ms("2026-10-04"));
  expect(where).toHaveBeenCalledWith("startTime", ">=", ms("2026-10-08"));
});

it.each(["cache", "error", "unknown"])("does not inherit parent fulfillment from %s data and retries independently", async mode => {
  const data = [ride("selected", "2026-10-10", 200), ...(mode === "unknown" ? [ride("unknown", "2026-10-07", undefined)] : [])];
  if (mode === "error") vi.mocked(getDocs).mockRejectedValueOnce(new Error("unavailable"));
  else vi.mocked(getDocs).mockResolvedValueOnce(page(data, mode !== "cache"));
  vi.mocked(getDocs).mockResolvedValueOnce(page([ride("selected", "2026-10-10", 200)]));
  const h = renderHook(() => usePlanPeriodComparison(options));
  await waitFor(() => expect(h.result.current.state).toBe("ready"));
  expect(h.result.current.summary.actualTss).toBe(200);
  expect(h.result.current.days.every(day => !day.fulfilledWeek)).toBe(true);
  {
    expect(h.result.current.parentWeeksPending).toBe(true);
    vi.mocked(getDocs).mockResolvedValueOnce(page([ride("selected", "2026-10-10", 200)]));
    act(() => h.result.current.retryParentWeeks());
    await waitFor(() => expect(h.result.current.days[1]?.fulfilledWeek?.actualTss).toBe(200));
    expect(h.result.current.summary.actualTss).toBe(200);
  }
});

it("separates discipline and keeps an unfulfilled week unfulfilled", async () => {
  vi.mocked(getDocs).mockResolvedValueOnce(page([ride("other-sport", "2026-10-07", 300, { type: "Run" }), ride("selected", "2026-10-10", 30)]))
    .mockResolvedValueOnce(page([ride("selected", "2026-10-10", 30)]));
  const h = renderHook(() => usePlanPeriodComparison(options));
  await waitFor(() => expect(h.result.current.state).toBe("ready"));
  expect(h.result.current.parentWeeksPending).toBe(false);
  expect(h.result.current.days.every(day => !day.fulfilledWeek && !day.parentWeekPending)).toBe(true);
});

it("drops pending parent reads across period/account changes and a history-style return", async () => {
  let resolveOld!: (snapshot: Snapshot) => void;
  vi.mocked(getDocs).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockResolvedValueOnce(page([]));
  const h = renderHook(({ owner, range }) => usePlanPeriodComparison({ ...options, uid: owner, range }), { initialProps: { owner: "owner", range: options.range } });
  await waitFor(() => expect(h.result.current.state).toBe("ready"));
  expect(h.result.current.days.every(day => !day.fulfilledWeek)).toBe(true);
  context.user = { uid: "other", isAnonymous: false };
  vi.mocked(getDocs).mockResolvedValue(page([]));
  h.rerender({ owner: "other", range: { start: "2026-10-12", end: "2026-10-18" } });
  await waitFor(() => expect(h.result.current.state).toBe("ready"));
  await act(async () => resolveOld(page([ride("old", "2026-10-10", 300)])));
  expect(h.result.current.days.every(day => !day.fulfilledWeek)).toBe(true);
  context.user = { uid: "owner", isAnonymous: false };
  h.rerender({ owner: "owner", range: options.range });
  await waitFor(() => expect(h.result.current.state).toBe("ready"));
  expect(h.result.current.days.every(day => !day.fulfilledWeek)).toBe(true);
});

it("only queries real, valid boundary weeks and avoids ambiguous overlapping parents", () => {
  expect(boundaryPlanWeeks([week], { start: "2026-10-05", end: "2026-10-11" })).toEqual([]);
  expect(boundaryPlanWeeks([week], { start: "2026-10-12", end: "2026-10-18" })).toEqual([]);
  expect(boundaryPlanWeeks([week], { start: "2026-02-30", end: "2026-10-11" })).toEqual([]);
  expect(boundaryPlanWeeks([{ ...week, days: [{ ...week.days[0], date: ms("2026-10-12") }] }], options.range)).toEqual([]);
  const h = renderHook(() => usePlanPeriodComparison({ ...options, weeks: [week, { ...week, id: "duplicate" }] }));
  expect(h.result.current.parentWeeksPending).toBe(true);
  expect(getDocs).toHaveBeenCalledTimes(1);
});

it("independently verifies two stored boundary weeks without adding their outside-period loads", async () => {
  const next = { ...week, id: "w7", weekNumber: 7, startDate: week.startDate + 7 * 86400000,
    days: week.days.map(day => ({ ...day, date: day.date + 7 * 86400000 })) };
  vi.mocked(getDocs).mockResolvedValueOnce(page([ride("earlier", "2026-10-07", 200)]))
    .mockResolvedValueOnce(page([ride("later", "2026-10-16", 300)]))
    .mockResolvedValueOnce(page([ride("selected", "2026-10-10", 30)]));
  const h = renderHook(() => usePlanPeriodComparison({ ...options, weeks: [next, week], range: { start: "2026-10-10", end: "2026-10-13" } }));
  await waitFor(() => expect(h.result.current.parentWeeksPending).toBe(false));
  expect(h.result.current.summary).toMatchObject({ actualTss: 30, plannedTss: 80 });
  expect(h.result.current.days[0].fulfilledWeek?.weekNumber).toBe(6);
  expect(h.result.current.days[2].fulfilledWeek?.weekNumber).toBe(7);
  expect(getDocs).toHaveBeenCalledTimes(3);
});

it("keeps a zero parent budget unfulfilled and does not invent a weekly ratio", async () => {
  vi.mocked(getDocs).mockResolvedValue(page([ride("selected", "2026-10-10", 200)]));
  const h = renderHook(() => usePlanPeriodComparison({ ...options, weeks: [{ ...week, days: week.days.map(day => ({ ...day, plannedTSS: 0 })) }] }));
  await waitFor(() => expect(h.result.current.parentWeeksPending).toBe(false));
  expect(h.result.current.days.every(day => !day.fulfilledWeek)).toBe(true);
  expect(h.result.current.summary.ratioPct).toBeNull();
});

it("does not let truncated parent pagination contaminate a complete selected period", async () => {
  const repeated = page(Array.from({ length: 200 }, (_, i) => ride(`row-${i}`, "2026-10-07", 200)));
  vi.mocked(getDocs).mockResolvedValueOnce(repeated).mockResolvedValueOnce(page([ride("selected", "2026-10-10", 30)])).mockResolvedValueOnce(repeated);
  const h = renderHook(() => usePlanPeriodComparison(options));
  await waitFor(() => expect(h.result.current.state).toBe("ready"));
  await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(3));
  expect(h.result.current.parentWeeksPending).toBe(true);
  expect(h.result.current.summary.actualTss).toBe(30);
  expect(h.result.current.days.every(day => !day.fulfilledWeek)).toBe(true);
});


it("does not retain bike fulfillment when discipline changes on the same stored date range", async () => {
  vi.mocked(getDocs).mockResolvedValueOnce(page([ride("bike", "2026-10-10", 200), ride("run", "2026-10-07", 10, { type: "Run" })])).mockResolvedValueOnce(page([ride("bike", "2026-10-10", 200)]));
  const h = renderHook(({ discipline }: { discipline: "bike" | "run" }) => usePlanPeriodComparison({ ...options, discipline }), { initialProps: { discipline: "bike" as "bike" | "run" } });
  await waitFor(() => expect(h.result.current.days[1]?.fulfilledWeek).toBeDefined());
  h.rerender({ discipline: "run" });
  expect(h.result.current.days.every(day => !day.fulfilledWeek)).toBe(true);
  expect(h.result.current.summary.actualTss).toBe(0);
});

it("shows an independent parent error, carries pending evidence on early navigation, and preserves period return", async () => {
  vi.mocked(getDocs).mockRejectedValueOnce(new Error("parent unavailable")).mockResolvedValueOnce(page([ride("selected", "2026-10-10", 30)]));
  const origin = "/ko/coach/plan?sport=bike&loadPeriod=range&loadStart=2026-10-09&loadEnd=2026-10-11&loadDetails=open";
  render(<MemoryRouter initialEntries={[origin]}><Routes>
    <Route path="/ko/coach/plan" element={<PlanLoadComparison uid="owner" discipline="bike" weeks={[week]} />} />
    <Route path="/ko/athlete/me/activities" element={<PlanRecordEvidence date="2026-10-10" plans={[{ discipline: "bike", workout: "z2", plannedTSS: 20, plannedDurationMin: 30 }]} />} />
  </Routes></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole("group", { name: "실제 TSS" })).toHaveTextContent("30"));
  expect(screen.getByText(/선택 기간의 합계와 별도로 저장된 주 전체의 근거/)).toBeVisible();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeEnabled();
  fireEvent.click(screen.getByRole("link", { name: "2026-10-10 근거 보기" }));
  expect(screen.getByText(/저장된 주 전체의 부하 근거가 미확인/)).toBeVisible();
  expect(screen.queryByText("W6 주간 부하 목표로 충족")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "원래 기간 부하 비교로 돌아가기" })).toHaveAttribute("href", origin + "#plan-load-comparison");
});

it("does not replay another owner's weekly snapshot through history state", () => {
  const row = { date: "2026-10-10", actualTss: 200, plannedTss: 20, ratioPct: 1000, deltaTss: 180,
    fulfilledWeek: { weekNumber: 6, actualTss: 230, plannedTss: 140, estimated: false } };
  const entry = { pathname: "/ko/athlete/me/activities", state: { periodEvidence: { uid: "owner", date: row.date, discipline: "bike", row } } };
  const tree = () => <MemoryRouter initialEntries={[entry]}><PlanRecordEvidence date={row.date} plans={[{ discipline: "bike", workout: "z2", plannedTSS: 20, plannedDurationMin: 30 }]} /></MemoryRouter>;
  const view = render(tree());
  expect(screen.getByText("W6 주간 부하 목표로 충족")).toBeVisible();
  context.user = { uid: "other", isAnonymous: false };
  view.rerender(tree());
  expect(screen.queryByText("W6 주간 부하 목표로 충족")).not.toBeInTheDocument();
});
