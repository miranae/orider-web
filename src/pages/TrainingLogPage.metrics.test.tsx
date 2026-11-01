import { useEffect, useLayoutEffect } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useNavigate, useLocation } from "react-router-dom";
import { getDocs, onSnapshot, where } from "firebase/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TrainingLogPage, {LogDayCell} from "./TrainingLogPage";
import * as planOverlay from "../features/training/plan/usePlanRecordOverlay";
import type {Activity} from "@shared/types";
import { planCalendarDate, planMonthBounds } from "@shared/training/planDate";

const state = vi.hoisted(() => ({ mobile: false, user: { uid: "rider" } as { uid: string; isAnonymous?: boolean } | null, recentRead: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("../hooks/useMobile", () => ({ useMobile: () => state.mobile }));
vi.mock("../components/mobile/ImportActivityModal", () => ({ default: () => null }));
vi.mock("../components/activity/RecentActivitySummary", () => ({ default: function Summary({ sport }: { sport: string }) { useEffect(() => { state.recentRead(); }, []); return <section data-testid="rolling-summary">Rolling summary · {sport}</section>; } }));

// 훈련 달력의 날짜 경계는 실행 머신의 시간대와 무관하게 KST 계약을 따른다.
// 아래 기록은 이번 달 1일 12시~다음 날에 놓인다. 1일 정오 전에 돌면 아직 미래라 화면이 달성 판정을 하지 않아
// 테스트가 시간 초과로 깨졌다(11/1 00시). 시계만 이번 달 15일 정오(KST)로 고정한다 — 타이머는 실제 그대로.
const realNow = planCalendarDate(Date.now());
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(planMonthBounds(realNow.getUTCFullYear(), realNow.getUTCMonth()).start + 14 * 86400000 + 12 * 3600000);
const now = planCalendarDate(Date.now());
const startTime = planMonthBounds(now.getUTCFullYear(), now.getUTCMonth()).start + 12 * 3600000;
const summaries = [
  { distance: 12000, ridingTimeMillis: 3600000, elevationGain: 120, tss: 70 },
  { distance: 3000, ridingTimeMillis: 1800000, elevationGain: 30.4, tss: 40 },
  { tss: 15 },
  { distance: null, ridingTimeMillis: null, elevationGain: null, tss: 10 },
  { distance: NaN, ridingTimeMillis: Infinity, elevationGain: -Infinity, tss: 5 },
  { distance: Infinity, ridingTimeMillis: NaN, elevationGain: NaN, tss: 0 },
];

beforeEach(() => {
  state.mobile = false;
  state.user = { uid: "rider" };
  state.recentRead.mockClear();
  const docs = [...summaries, null].map((summary, index) => ({
    id: `ride-${index}`,
    data: () => ({ userId: "rider", startTime: startTime + index * 2 * 3600000, type: "Ride", description: `Ride ${index}`, summary }),
  }));
  vi.mocked(getDocs).mockReset();
  vi.mocked(getDocs)
    .mockResolvedValue({ docs: [], empty: true } as unknown as Awaited<ReturnType<typeof getDocs>>)
    .mockResolvedValueOnce({ docs, empty: false } as unknown as Awaited<ReturnType<typeof getDocs>>);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function expectMetric(label: string, value: string) {
  expect(screen.getByText(label).parentElement).toHaveTextContent(value);
}

function QueryNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  return <button onClick={() => { const next = new URLSearchParams(location.search); next.set("sport", "bike"); navigate(`?${next}`); }}>Change sport query</button>;
}

describe("운동 기록의 부분 요약", () => {
  it("mounts the recent summary only for a mobile owner's activity tab and keeps it across sport changes", async () => {
    state.mobile = true;
    render(<MemoryRouter initialEntries={["/?sport=run"]}><QueryNavigation /><TrainingLogPage /></MemoryRouter>);
    await screen.findByRole("tab", { name: "활동" });
    expect(state.recentRead).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "활동" }));
    expect(await screen.findByTestId("rolling-summary")).toHaveTextContent("run");
    expect(state.recentRead).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Change sport query" }));
    expect(screen.getByTestId("rolling-summary")).toHaveTextContent("bike");
    expect(state.recentRead).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("tab", { name: "월간" }));
    expect(screen.queryByTestId("rolling-summary")).not.toBeInTheDocument();
  });
  it("does not mount the personal recent summary for an anonymous log session", async () => {
    state.mobile = true;
    state.user = { uid: "anonymous", isAnonymous: true };
    render(<MemoryRouter><TrainingLogPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("tab", { name: "활동" }));
    expect(state.recentRead).not.toHaveBeenCalled();
    expect(screen.queryByTestId("rolling-summary")).not.toBeInTheDocument();
  });
  it("desktop calendar honors sport queries and subsequent navigation", async () => {
    const docs = [
      { id: "bike", data: () => ({ userId: "rider", startTime, type: "Ride", summary: { distance: 20000, tss: 30 } }) },
      { id: "run", data: () => ({ userId: "rider", startTime: startTime + 7200000, type: "Run", summary: { distance: 5000, tss: 20 } }) },
    ];
    vi.mocked(getDocs).mockReset();
    vi.mocked(getDocs).mockResolvedValue({ docs: [], empty: true } as never).mockResolvedValueOnce({ docs, empty: false } as never);
    render(<MemoryRouter initialEntries={["/?sport=run"]}><QueryNavigation /><TrainingLogPage /></MemoryRouter>);
    await waitFor(() => expectMetric("이동거리", "5.0"));
    expect(state.recentRead).not.toHaveBeenCalled();
    expect(within(screen.getByTestId("P1-1")).getByRole("button", { name: /러닝/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByText("Change sport query", { selector: "button" }));
    await waitFor(() => expectMetric("이동거리", "20.0"));
    expect(within(screen.getByTestId("P1-1")).getByRole("button", { name: /사이클/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("데스크톱 합계와 캘린더에서 누락·비유한 측정값만 제외하고 활동 수와 TSS는 보존한다", async () => {
    const { container } = render(<MemoryRouter><TrainingLogPage /></MemoryRouter>);
    await waitFor(() => expectMetric("전체 활동수", "7"));
    expectMetric("이동거리", "15.0");
    expectMetric("운동시간", "1h 30m");
    expectMetric("상승고도", "150");
    expectMetric("훈련부하 TSS", "140");
    const more = screen.getByText("외 4건 보기", { selector: "button" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(more);
    expect(screen.getByLabelText(/Ride 5/, { selector: "button" })).toBeInTheDocument();
    expect(screen.getByText("접기", { selector: "button" })).toHaveAttribute("aria-expanded", "true");
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("모바일 월 요약·종목 거리·활동 목록도 같은 안전한 측정값을 사용한다", async () => {
    state.mobile = true;
    const { container } = render(<MemoryRouter><TrainingLogPage /></MemoryRouter>);
    await waitFor(() => expectMetric("활동횟수", "7"));
    const glance = screen.getByLabelText("이번 달 운동 요약");
    expect(glance).toHaveTextContent("1h 30m");
    expect(glance).toHaveTextContent("140");
    expectMetric("누적 상승고도", "150m");
    expect(glance).toHaveTextContent("15.0km");
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
    fireEvent.click(screen.getByRole("tab", { name: "활동" }));
    expect(screen.getByText("Ride 2")).toBeInTheDocument();
    expect([...container.querySelectorAll(".mobile-log__activity-distance")].filter((item) => item.textContent === "—")).toHaveLength(5);
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
  });
});

describe("운동 기록의 확정 부하와 달성 상태", () => {
  it("날짜 경계 쌍둥이의 원본 목록은 보존하고 대표 부하가 없는 날짜는 달성을 확정하지 않는다", async () => {
    const nativeStart = startTime + 12 * 3600000 - 15000;
    const stravaStart = nativeStart + 30000;
    const docs = [
      { id: "native-boundary", data: () => ({ userId: "rider", source: "orider", type: "Ride", description: "원본 기록",
        startTime: nativeStart, summary: { distance: 1000, ridingTimeMillis: 3600000, tss: 100 } }) },
      { id: "strava_1", data: () => ({ userId: "rider", source: "strava", type: "Ride", description: "대표 기록",
        startTime: stravaStart, summary: { distance: 1000, ridingTimeMillis: 3600000, tss: 100 } }) },
    ];
    vi.mocked(getDocs).mockReset();
    vi.mocked(getDocs).mockResolvedValue({ docs: [], empty: true } as never)
      .mockResolvedValueOnce({ docs, empty: false } as never)
      .mockResolvedValueOnce({ docs: [], empty: true } as never)
      .mockResolvedValueOnce({ docs: [{ id: "goal", data: () => ({}) }], empty: false } as never)
      .mockResolvedValueOnce({ docs: [{ id: "week", data: () => ({ days: [nativeStart, stravaStart].map((date) => ({
        date, workout: "z2", plannedTSS: 80, plannedDurationMin: 60,
      })) }) }], empty: false } as never);
    render(<MemoryRouter><TrainingLogPage /></MemoryRouter>);
    await waitFor(() => expectMetric("훈련부하 TSS", "100"));
    expectMetric("전체 활동수", "1");
    await waitFor(() => expect(screen.getAllByText("수행 여부 미확인").length).toBeGreaterThan(0));
    expect(screen.getByRole("button", { name: /원본 기록/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /대표 기록/ })).toBeInTheDocument();
  });

  it.each([false, true])("accepted 부하를 쓰고 미확인 활동 혼입=%s면 달성을 확정하지 않는다", async (unknown) => {
    const docs = [{id: "accepted-ride", data: () => ({userId: "rider", source: "strava", type: "Ride", startTime,
      summary: {ridingTimeMillis: 3600000, tss: 122},
      serverDerivedLoad: {schemaVersion: 1, userId: "rider", inputBinding: "accepted-revision", streamTss: 306.93}})}];
    if (unknown) docs.push({id: "unknown-ride", data: () => ({userId: "rider", source: "strava", type: "Ride", startTime: startTime + 7200000,
      summary: null as unknown as {ridingTimeMillis: number; tss: number}, serverDerivedLoad: undefined as never})});
    vi.mocked(getDocs).mockReset();
    vi.mocked(getDocs).mockResolvedValue({docs: [], empty: true} as never)
      .mockResolvedValueOnce({docs, empty: false} as never)
      .mockResolvedValueOnce({docs: [], empty: true} as never)
      .mockResolvedValueOnce({docs: [{id: "goal", data: () => ({})}], empty: false} as never)
      .mockResolvedValueOnce({docs: [{id: "week", data: () => ({days: [{date: startTime, workout: "z2", plannedTSS: 200, plannedDurationMin: 60}]})}], empty: false} as never);
    render(<MemoryRouter><TrainingLogPage /></MemoryRouter>);
    await waitFor(() => expectMetric("훈련부하 TSS", "307"));
    if (unknown) {
      await waitFor(() => expect(screen.getAllByText("수행 여부 미확인").length).toBeGreaterThan(0));
      expect(screen.queryByText("△")).not.toBeInTheDocument();
      expect(screen.queryByText("✓")).not.toBeInTheDocument();
    } else {
      await waitFor(() => expect(screen.getAllByText("수행 여부 미확인").length).toBeGreaterThan(0));
      expect(screen.queryByText("✓")).not.toBeInTheDocument();
    }
  });
});

it("개별 미확인 거리·시간은 실제 영 기록과 구분한다", async () => {
  state.mobile = true;
  const docs = [
    {id: "zero", data: () => ({userId: "rider", startTime, type: "Ride", description: "실제 영 기록", summary: {distance: 0, ridingTimeMillis: 0, tss: 0}})},
    {id: "missing", data: () => ({userId: "rider", startTime: startTime + 7200000, type: "Ride", description: "미확인 기록", summary: {}})},
  ];
  vi.mocked(getDocs).mockReset().mockResolvedValue({docs: [], empty: true} as never)
    .mockResolvedValueOnce({docs, empty: false} as never);
  render(<MemoryRouter><TrainingLogPage /></MemoryRouter>);
  await waitFor(() => expectMetric("활동횟수", "2"));
  fireEvent.click(screen.getByRole("tab", {name: "활동"}));
  const zero = screen.getByText("실제 영 기록").closest("button")!;
  const missing = screen.getByText("미확인 기록").closest("button")!;
  expect(zero).toHaveTextContent("0.0km");
  expect(zero).toHaveTextContent("0:00");
  expect(missing).toHaveTextContent("—");
  expect(missing).not.toHaveTextContent("0.0km");
  expect(missing).not.toHaveTextContent("0:00");
});

it.each([false, true])("월 경계 대표 후보를 첫 조회에 확보하고 방문 순서와 무관하며 재방문 읽기를 늘리지 않는다 (mobile=%s)", async (mobile) => {
  state.mobile = mobile;
  const bounds = planMonthBounds(now.getUTCFullYear(), now.getUTCMonth());
  const nativeStart = bounds.end - 15000;
  const native = { userId: "rider", source: "orider", type: "Ride", startTime: nativeStart,
    description: "월말 원본", summary: {distance: 3000, ridingTimeMillis: 3600000, tss: 30} };
  const docs = [{id: "native", data: () => native},
    {id: "strava_1", data: () => ({...native, source: "strava", startTime: nativeStart + 30000})}];
  vi.mocked(getDocs).mockReset().mockResolvedValue({docs: [], empty: true} as never)
    .mockResolvedValueOnce({docs, empty: false} as never)
    .mockResolvedValueOnce({docs, empty: false} as never);
  vi.mocked(where).mockClear();
  render(<MemoryRouter><TrainingLogPage /></MemoryRouter>);
  await waitFor(() => expectMetric(mobile ? "활동횟수" : "전체 활동수", "0"));
  expectMetric("이동거리", mobile ? "0.0km" : "0.0");
  expect(where).toHaveBeenCalledWith("startTime", ">=", bounds.start - 86400000);
  expect(where).toHaveBeenCalledWith("startTime", "<=", bounds.end + 86400000);
  // 초기 선택 월 + 직전 월 두 활동 쿼리와 계획 조회 한 번. 재렌더링은 재조회하지 않는다.
  await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(3));
  const monthNavigation = () => mobile ? screen.getByLabelText(/이전 달/, { selector: "button" }).parentElement! : screen.getByTestId("P1-0");
  const previous = () => fireEvent.click(within(monthNavigation()).getByRole("button", {name: /이전 달/}));
  const next = () => fireEvent.click(within(monthNavigation()).getByRole("button", {name: /다음 달/}));
  previous();
  await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(4));
  next();
  await waitFor(() => expectMetric(mobile ? "활동횟수" : "전체 활동수", "0"));
  previous();
  next();
  expect(getDocs).toHaveBeenCalledTimes(4);
  expectMetric("이동거리", mobile ? "0.0km" : "0.0");
  if (mobile) {
    fireEvent.click(screen.getByRole("tab", {name: "활동"}));
    expect(screen.getAllByText("월말 원본")).toHaveLength(1);
  } else {
    expect(screen.getByRole("button", {name: /월말 원본/})).toBeInTheDocument();
  }
});


it.each([false, true])("30시간 전 대표가 직전월 preload에 있어도 현재월 조각을 다시 세지 않는다 mobile=%s", async mobile => {
  state.mobile = mobile;
  const start = planMonthBounds(now.getUTCFullYear(), now.getUTCMonth()).start;
  const fragment = {userId: "rider", source: "orider", type: "Ride", rollupSupersededBy: "long-full", startTime: start, endTime: start + 3600000, description: "긴 주행 조각", summary: {distance: 3000, ridingTimeMillis: 3600000, tss: 30}};
  const full = {...fragment, source: "strava", rollupSupersededBy: null, startTime: start - 30 * 3600000, summary: {distance: 100000, ridingTimeMillis: 31 * 3600000, tss: 100}};
  vi.mocked(getDocs).mockReset().mockResolvedValue({docs: [], empty: true} as never)
    .mockResolvedValueOnce({docs: [{id: "fragment", data: () => fragment}], empty: false} as never)
    .mockResolvedValueOnce({docs: [{id: "long-full", data: () => full}], empty: false} as never);
  render(<MemoryRouter><TrainingLogPage /></MemoryRouter>);
  await waitFor(() => expectMetric(mobile ? "활동횟수" : "전체 활동수", "0"));
  expectMetric("이동거리", mobile ? "0.0km" : "0.0");
  expect(screen.getByRole("button", {name: /긴 주행 조각/})).toBeInTheDocument();
});

it("모바일 대표 조회 실패는 원본을 유지하고 합계만 미확인으로 남긴다", async () => {
  state.mobile = true;
  const fragment = {userId: "rider", source: "orider", type: "Ride", rollupSupersededBy: "missing-full", startTime, endTime: startTime + 3600000, description: "보존할 원본", summary: {distance: 3000, ridingTimeMillis: 3600000, tss: 30}};
  vi.mocked(getDocs).mockReset().mockResolvedValue({docs: [], empty: true} as never)
    .mockResolvedValueOnce({docs: [{id: "fragment", data: () => fragment}], empty: false} as never);
  vi.mocked(onSnapshot).mockImplementationOnce((_ref, _next, reject) => {
    (reject as (error: Error) => void)(new Error("permission-denied"));
    return vi.fn();
  });
  render(<MemoryRouter><TrainingLogPage /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole("button", {name: /보존할 원본/})).toBeInTheDocument());
  expect(screen.getByLabelText("이번 달 운동 요약")).toHaveTextContent("–");
  expect(screen.getByLabelText("이번 달 운동 요약")).not.toHaveTextContent("3.0km");
});


describe("activity month owner isolation", () => {
  type Snapshot = Awaited<ReturnType<typeof getDocs>>;
  const empty = { docs: [], empty: true } as unknown as Snapshot;
  const snapshot = (uid: string, name: string): Snapshot => ({ docs: [{ id: `${uid}-record`, data: () => ({userId: uid, type: "Ride", description: name, startTime, summary: {distance: 1000, ridingTimeMillis: 600000, tss: 0}})}], empty: false }) as unknown as Snapshot;
  function pending() { let resolve!: (value: Snapshot) => void; let reject!: (reason: Error) => void; const promise = new Promise<Snapshot>((yes,no) => { resolve=yes; reject=no; }); return {promise,resolve,reject}; }

  it("hides a loaded previous owner in the first commit before passive cache reset", async () => {
    state.mobile=true;
    vi.mocked(getDocs).mockReset().mockResolvedValue(empty).mockResolvedValueOnce(snapshot("rider", "이전 계정 기록"));
    const frames: string[]=[];
    function Probe() { useLayoutEffect(() => { frames.push(document.body.textContent ?? ""); }); return <TrainingLogPage/>; }
    const view=render(<MemoryRouter><Probe/></MemoryRouter>);
    fireEvent.click(await screen.findByRole("tab",{name:"활동"}));
    expect(await screen.findByText("이전 계정 기록")).toBeInTheDocument();
    const next=pending();vi.mocked(getDocs).mockImplementationOnce(() => next.promise);
    state.user={uid:"next-owner"};
    view.rerender(<MemoryRouter><Probe/></MemoryRouter>);
    expect(frames.at(-1)).not.toContain("이전 계정 기록");
    expect(screen.queryByText("이전 계정 기록")).not.toBeInTheDocument();
    await act(async () => next.resolve(snapshot("next-owner", "현재 계정 기록")));
    expect(await screen.findByText("현재 계정 기록")).toBeInTheDocument();
  });

  it.each([
    {outcome:"success", afterCurrent:false}, {outcome:"failure", afterCurrent:false},
    {outcome:"success", afterCurrent:true}, {outcome:"failure", afterCurrent:true},
  ] as const)("ignores previous owner $outcome with current owner loaded=$afterCurrent", async ({outcome,afterCurrent}) => {
    state.mobile=true;
    const previous=pending(), next=pending();
    vi.mocked(getDocs).mockReset().mockResolvedValue(empty).mockImplementationOnce(() => previous.promise);
    const view=render(<MemoryRouter><TrainingLogPage/></MemoryRouter>);
    await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(3));
    vi.mocked(getDocs).mockImplementationOnce(() => next.promise);
    state.user={uid:"next-owner"};
    view.rerender(<MemoryRouter><TrainingLogPage/></MemoryRouter>);
    await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(6));
    fireEvent.click(screen.getByRole("tab",{name:"활동"}));
    if(afterCurrent) await act(async () => next.resolve(snapshot("next-owner","새 계정 완료 기록")));
    await act(async () => { if(outcome==="success") previous.resolve(snapshot("rider","늦은 이전 기록")); else previous.reject(new Error("old-owner-failure")); });
    expect(screen.queryByText("늦은 이전 기록")).not.toBeInTheDocument();
    // A stale success must not mark B's still-pending month as loaded; a stale failure must not show its error/retry screen.
    if(!afterCurrent) expect(document.querySelector('[aria-hidden="true"] .grid-cols-7')).toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"다시 시도"})).not.toBeInTheDocument();
    if(!afterCurrent) await act(async () => next.resolve(snapshot("next-owner","새 계정 완료 기록")));
    expect(await screen.findByText("새 계정 완료 기록")).toBeInTheDocument();
    expect(screen.queryByText("늦은 이전 기록")).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"다시 시도"})).not.toBeInTheDocument();
  });
});


it("does not normalize an impossible day deep link into another calendar month", async () => {
  vi.mocked(getDocs).mockReset().mockResolvedValue({docs:[],empty:true} as never);
  vi.mocked(where).mockClear();
  render(<MemoryRouter initialEntries={["/?day=2026-02-31&detail=record-day"]}><TrainingLogPage/></MemoryRouter>);
  await waitFor(() => expectMetric("전체 활동수","0"));
  expect(getDocs).toHaveBeenCalledTimes(3);
  const bounds=planMonthBounds(now.getUTCFullYear(),now.getUTCMonth());
  expect(where).toHaveBeenCalledWith("startTime", ">=", bounds.start - 86400000);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

function HistoryProbe() {
  const navigate = useNavigate();
  const location = useLocation();
  return <><output data-testid="record-url">{location.pathname}{location.search}</output><button onClick={() => navigate(-1)}>History back</button><button onClick={() => navigate(1)}>History forward</button></>;
}
it.each([false, true])("preserves a selected day through month navigation, history and reload mobile=%s", async mobile => {
  state.mobile = mobile;
  vi.mocked(getDocs).mockReset().mockResolvedValue({ docs: [], empty: true } as never);
  const mount = (entry: string) => render(<MemoryRouter initialEntries={[entry]}><HistoryProbe /><TrainingLogPage /></MemoryRouter>);
  const view = mount("/ko/athlete/me/activities?sport=run&date=2026-09-17");
  const planLink = () => screen.getByRole("link", { name: "훈련 계획" });
  await waitFor(() => expect(planLink()).toHaveAttribute("href", "/ko/coach/plan?sport=run&date=2026-09-17"));
  fireEvent.click(screen.getByRole("button", { name: /이전 달/ }));
  await waitFor(() => expect(planLink()).toHaveAttribute("href", "/ko/coach/plan?sport=run&date=2026-08-01"));
  expect(screen.getByTestId("record-url")).toHaveTextContent("date=2026-08-01");
  fireEvent.click(screen.getByRole("button", { name: "History back" }));
  await waitFor(() => expect(planLink()).toHaveAttribute("href", "/ko/coach/plan?sport=run&date=2026-09-17"));
  fireEvent.click(screen.getByRole("button", { name: "History forward" }));
  await waitFor(() => expect(planLink()).toHaveAttribute("href", "/ko/coach/plan?sport=run&date=2026-08-01"));
  const reloadUrl = screen.getByTestId("record-url").textContent!;
  view.unmount(); mount(reloadUrl);
  await waitFor(() => expect(planLink()).toHaveAttribute("href", "/ko/coach/plan?sport=run&date=2026-08-01"));
});
it.each(["all", "tri", ""])("keeps the all-records filter, query and plan destination consistent sport=%s", async sport => {
  vi.mocked(getDocs).mockReset().mockResolvedValue({ docs: [], empty: true } as never);
  render(<MemoryRouter initialEntries={[`/ko/athlete/me/activities${sport ? `?sport=${sport}` : ""}`]}><HistoryProbe /><TrainingLogPage /></MemoryRouter>);
  await waitFor(() => expect(within(screen.getByTestId("P1-1")).getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "true"));
  if (sport) expect(screen.getByTestId("record-url")).toHaveTextContent("sport=all");
  expect(screen.getByRole("link", { name: "훈련 계획" }).getAttribute("href")).toContain("sport=bike");
});


describe("desktop day record pagination",()=>{
  const dayKey=new Date(startTime+9*3600000).toISOString().slice(0,10);
  const rows=(count:number)=>Array.from({length:count},(_,index)=>({id:`dense-${index+1}`,userId:"rider",type:"Ride",description:`기록 ${String(index+1).padStart(4,"0")}`,startTime:startTime+index*1000,summary:{distance:0,ridingTimeMillis:0,tss:0}} as Activity));
  const cell=(activities:Activity[])=><LogDayCell activities={activities} loadActivities={activities} plans={[]} isToday={false} isCurrentMonth dayNum={1} dateKey={dayKey} todayKey={dayKey}/>;
  it.each([0,1])("keeps %s records directly available without unnecessary page controls", count=>{
    render(<MemoryRouter>{cell(rows(count))}</MemoryRouter>);
    expect(screen.queryAllByRole("button",{name:/^기록 /})).toHaveLength(count);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
  it("bounds a thousand records to twenty per page and reaches every record including the last",()=>{
    render(<MemoryRouter>{cell(rows(1000))}</MemoryRouter>);
    expect(screen.getAllByRole("button",{name:/^기록 /})).toHaveLength(2);
    fireEvent.click(screen.getByRole("button",{name:"외 998건 보기"}));
    const pages=screen.getByRole("navigation",{name:"이 날짜의 활동 페이지"});
    expect(within(pages).getByRole("button",{name:"이전 기록"})).toBeDisabled();
    const seen=new Set<string>();
    for(let page=1;page<=50;page++){
      const records=screen.getAllByRole("button",{name:/^기록 /});
      expect(records).toHaveLength(20);
      for(const row of records) seen.add(row.getAttribute("aria-label")!);
      if(page<50) fireEvent.click(within(pages).getByRole("button",{name:"다음 기록"}));
    }
    expect(seen.size).toBe(1000);
    expect(within(pages).getByRole("status")).toHaveTextContent("1000개 중 981–1000 · 50/50페이지");
    expect(within(pages).getByRole("button",{name:"다음 기록"})).toBeDisabled();
    expect(screen.getByRole("button",{name:/^기록 1000 /})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"접기"}));
    expect(screen.getAllByRole("button",{name:/^기록 /})).toHaveLength(2);
    fireEvent.click(screen.getByRole("button",{name:"외 998건 보기"}));
    expect(screen.getByRole("button",{name:/^기록 0001 /})).toBeInTheDocument();
  }, 60_000); // 50페이지 순회 — 단독 2.5초, 머지 게이트 부하에서 15초를 넘긴 적이 있다.
  it("restores the last page after opening an individual activity and going back, preserving other URL context",async()=>{
    render(<MemoryRouter initialEntries={[`/ko/athlete/me/activities?sport=bike&date=${dayKey}&calendarDay=${dayKey}&calendarPage=50&keep=1`]}><HistoryProbe/>{cell(rows(1000))}</MemoryRouter>);
    fireEvent.click(screen.getByRole("button",{name:/^기록 1000 /}));
    expect(screen.getByTestId("record-url")).toHaveTextContent("/activity/dense-1000");
    fireEvent.click(screen.getByRole("button",{name:"History back"}));
    await waitFor(()=>expect(screen.getByRole("button",{name:/^기록 1000 /})).toBeInTheDocument());
    expect(screen.getAllByRole("button",{name:/^기록 /})).toHaveLength(20);
    expect(screen.getByTestId("record-url")).toHaveTextContent("sport=bike");
    expect(screen.getByTestId("record-url")).toHaveTextContent(`date=${dayKey}`);
    expect(screen.getByTestId("record-url")).toHaveTextContent("calendarPage=50");
    expect(screen.getByTestId("record-url")).toHaveTextContent("keep=1");
  });
});

it("opens the desktop plan comparison without dropping the selected record context", () => {
  const dateKey = new Date(startTime + 9 * 3600000).toISOString().slice(0, 10);
  render(<MemoryRouter initialEntries={[`/ko/athlete/me/activities?sport=bike&date=${dateKey}&calendarPage=3&range=90`]}><HistoryProbe /><LogDayCell activities={[]} loadActivities={[]} plans={[{discipline:"bike",workout:"z2",plannedTSS:65,plannedDurationMin:90,probableActivityId:"candidate",probableTSS:100}]} isToday={false} isCurrentMonth dayNum={1} dateKey={dateKey} todayKey={dateKey} /></MemoryRouter>);
  fireEvent.click(screen.getByTestId("P1-2-2"));
  expect(screen.getByTestId("record-url")).toHaveTextContent("/ko/athlete/me/activities");
  expect(screen.getByTestId("record-url")).toHaveTextContent(`day=${dateKey}`);
  expect(screen.getByTestId("record-url")).toHaveTextContent("detail=record-day");
  expect(screen.getByTestId("record-url")).toHaveTextContent("calendarPage=3&range=90");
});

it.each(["rider", "other"])("keeps period return inside mobile day detail and scoped to owner %s", async uid => {
  state.mobile = true;
  const date = new Date(startTime + 9 * 3600000).toISOString().slice(0, 10);
  render(<MemoryRouter initialEntries={[{ pathname: "/ko/athlete/me/activities", search: `?sport=bike&date=${date}&day=${date}&detail=record-day`, state: { fitnessPeriodReturn: { uid, pathname: "/ko/coach/analysis", search: "?sport=bike&detail=analysis-periods", hash: "" } } }]}><TrainingLogPage /></MemoryRouter>);
  if (uid === "rider") {
    const link = await screen.findByRole("link", { name: "기간 분석으로 돌아가기" });
    expect(link.closest(".coach-detail")).not.toBeNull();
    expect(link).toHaveAttribute("href", "/ko/coach/analysis?sport=bike&detail=analysis-periods");
  } else {
    await screen.findByRole("tab", { name: "활동" });
    expect(screen.queryByRole("link", { name: "기간 분석으로 돌아가기" })).toBeNull();
  }
});

it("keeps month date links on the calendar when the selected date has a plan, while explicit day selection opens details", async () => {
  const plans = new Map([["2026-10-01", [{ discipline: "bike" as const, workout: "rest" as const, plannedTSS: 0, plannedDurationMin: 0 }]]]);
  vi.spyOn(planOverlay, "usePlanRecordOverlay").mockReturnValue({ state: "ready", plans, retry: vi.fn() });
  vi.mocked(getDocs).mockReset().mockResolvedValue({ docs: [], empty: true } as never);
  const open = (search: string) => render(<MemoryRouter initialEntries={[`/ko/athlete/me/activities?sport=bike&${search}`]}><TrainingLogPage /></MemoryRouter>);
  let view = open("date=2026-09-01");
  await waitFor(() => expect(screen.getByTestId("P1-0")).toHaveTextContent("2026년 9월"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  view.unmount();
  view = open("date=2026-10-01");
  await waitFor(() => expect(screen.getByTestId("P1-0")).toHaveTextContent("2026년 10월"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId("P1-2-2"));
  expect(await screen.findByRole("dialog", { name: "2026-10-01 계획과 기록" })).toBeVisible();
  view.unmount();
  open("date=2026-10-01&day=2026-10-01&detail=record-day");
  expect(await screen.findByRole("dialog", { name: "2026-10-01 계획과 기록" })).toBeVisible();
});
