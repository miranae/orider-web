import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import type { Activity } from "@shared/types";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import MobileLogPage from "./MobileLogPage";
vi.mock("./ImportActivityModal", () => ({ default: () => null }));
// 1000건 렌더 + 페이지 이동이라 단독 1초 안팎이지만, 머지 게이트가 수천 개 테스트와 같이 돌 때 기본 5초를 넘긴다.
vi.setConfig({ testTimeout: 60_000 });
const records = (count: number): Activity[] => Array.from({ length: count }, (_, i) => ({ id: `record-${i}`, type: "Ride", description: `Ride record-${i}`, startTime: Date.parse("2026-09-03T09:00:00+09:00") + i * 1000, summary: { distance: 10000, ridingTimeMillis: 3600000 } }) as Activity);
function Probe() { const loc = useLocation(); const nav = useNavigate(); return <><output data-testid="url">{loc.pathname}{loc.search}</output><button onClick={() => nav(-1)}>Browser Back</button><button onClick={() => nav(1)}>Browser Forward</button></>; }
function App({ activities, loading = false, onChangeMonth = vi.fn() }: { activities: Activity[]; loading?: boolean; onChangeMonth?: (delta: number) => void }) { return <><Probe /><Routes><Route path="/ko/athlete/me/activities" element={<MobileLogPage activities={activities} loading={loading} year={2026} month={8} onChangeMonth={onChangeMonth} />} /><Route path="/ko/activity/:id" element={<h1>Activity details</h1>} /></Routes></>; }
const base = "/ko/athlete/me/activities?sport=bike&date=2026-09-03&view=activities";
const rows = () => screen.queryAllByRole("button", { name: /Ride record-/ });
describe("bounded month record search and navigation", () => {
  it.each([0, 1, 1000])("keeps %s loaded activities within a 20-row page and declares its search scope", count => {
    renderWithProviders(<App activities={records(count)} />, { route: base });
    expect(rows()).toHaveLength(Math.min(count, 20));
    expect(screen.getByRole("searchbox", { name: "선택한 달에서 활동 찾기" })).toHaveValue("");
    expect(screen.getByText(/선택 종목으로 불러온 기록/)).toHaveTextContent("2026년 9월");
    if (count === 0) expect(screen.getByText("아직 활동 기록이 없어요")).toBeInTheDocument();
  });
  it("preserves query, exact month, sport and bounded page after activity/back, forward and reload", async () => {
    const activities = records(1000);
    const view = renderWithProviders(<App activities={activities} />, { route: base });
    fireEvent.click(screen.getByRole("button", { name: "다음 기록" }));
    expect(rows()).toHaveLength(20);
    expect(screen.getByTestId("url")).toHaveTextContent("page=2&pageMonth=2026-09");
    fireEvent.click(rows()[0]!);
    await screen.findByRole("heading", { name: "Activity details" });
    fireEvent.click(screen.getByRole("button", { name: "Browser Back" }));
    await screen.findByRole("searchbox");
    expect(rows()).toHaveLength(20);
    expect(screen.getByRole("navigation", { name: "활동 기록 페이지" })).toHaveTextContent("21–40");
    fireEvent.click(screen.getByRole("button", { name: "Browser Forward" }));
    await screen.findByRole("heading", { name: "Activity details" });
    fireEvent.click(screen.getByRole("button", { name: "Browser Back" }));
    const search = await screen.findByRole("searchbox");
    fireEvent.change(search, { target: { value: "record-999" } });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent("Ride record-999");
    const url = screen.getByTestId("url").textContent!;
    view.unmount();
    renderWithProviders(<App activities={activities} />, { route: url });
    expect(screen.getByRole("searchbox")).toHaveValue("record-999");
    expect(rows()).toHaveLength(1);
    expect(screen.getByTestId("url")).toHaveTextContent("date=2026-09-03");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "not-found" } });
    expect(rows()).toHaveLength(0);
    expect(screen.getByText("선택한 달과 종목에서 검색 결과가 없습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "검색 지우기" }));
    expect(rows()).toHaveLength(20);
  });
  it("bounds a dense day detail too without hiding later records", async () => {
    renderWithProviders(<App activities={records(1000)} />, { route: `${base}&day=2026-09-03&detail=record-day` });
    const dialog = screen.getByRole("dialog", { name: "2026-09-03 계획과 기록" });
    expect(within(dialog).getAllByRole("button", { name: /Ride record-/ })).toHaveLength(20);
    const nav = within(dialog).getByRole("navigation", { name: "이 날짜의 활동 페이지" });
    fireEvent.click(within(nav).getByRole("button", { name: "다음 기록" }));
    await waitFor(() => expect(nav).toHaveTextContent("21–40"));
    expect(within(dialog).getAllByRole("button", { name: /Ride record-/ })).toHaveLength(20);
  });
});

it.each(["close", "escape"])("keeps day pagination in one modal history entry and returns to the prior context with %s", async action => {
  renderWithProviders(<App activities={records(1000)} />, { route: `${base}&q=record-9&page=2&pageMonth=2026-09` });
  fireEvent.click(screen.getByRole("tab", { name: "월간" }));
  fireEvent.click(screen.getByRole("button", { name: "9월 3일 활동 1000건" }));
  const dialog = screen.getByRole("dialog", { name: "2026-09-03 계획과 기록" });
  fireEvent.click(within(dialog).getByRole("button", { name: "다음 기록" }));
  await waitFor(() => expect(within(dialog).getByRole("navigation", { name: "이 날짜의 활동 페이지" })).toHaveTextContent("21–40"));
  const close = within(dialog).getByRole("button", { name: "← 뒤로" });
  if (action === "escape") fireEvent.keyDown(close, { key: "Escape" }); else fireEvent.click(close);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("tab", { name: "월간" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByTestId("url")).not.toHaveTextContent("dayPage");
  fireEvent.click(screen.getByRole("button", { name: "Browser Back" }));
  await waitFor(() => expect(screen.getByRole("tab", { name: "활동" })).toHaveAttribute("aria-selected", "true"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("searchbox")).toHaveValue("record-9");
  expect(screen.getByRole("navigation", { name: "활동 기록 페이지" })).toHaveTextContent("21–40");
});

it("shares month controls directly in the activity search tab and announces no matches", () => {
  const changeMonth = vi.fn();
  renderWithProviders(<App activities={records(1)} onChangeMonth={changeMonth} />, { route: base });
  fireEvent.click(screen.getByRole("button", { name: "← 이전 달" }));
  expect(changeMonth).toHaveBeenLastCalledWith(-1);
  fireEvent.click(screen.getByRole("button", { name: "다음 달 →" }));
  expect(changeMonth).toHaveBeenLastCalledWith(1);
  expect(screen.getByRole("tab", { name: "활동" })).toHaveAttribute("aria-selected", "true");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no-result" } });
  expect(screen.getByText("선택한 달과 종목에서 검색 결과가 없습니다.")).toHaveAttribute("role", "status");
});
it("keeps the requested page through a cold load then clamps when the loaded result set shrinks", () => {
  const view = renderWithProviders(<App activities={[]} loading />, { route: `${base}&page=50&pageMonth=2026-09` });
  expect(rows()).toHaveLength(0);
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  view.rerender(<App activities={records(1000)} />);
  expect(rows()).toHaveLength(20);
  expect(screen.getByRole("navigation", { name: "활동 기록 페이지" })).toHaveTextContent("981–1000");
  view.rerender(<App activities={records(1)} />);
  expect(rows()).toHaveLength(1);
  expect(screen.getByRole("navigation", { name: "활동 기록 페이지" })).toHaveTextContent("1–1");
});
it.each(["0", "-1", "not-a-page", "1e100"])("renders the first bounded page for an invalid page=%s", page => {
  renderWithProviders(<App activities={records(41)} />, { route: `${base}&page=${page}&pageMonth=2026-09` });
  expect(rows()).toHaveLength(20);
  expect(screen.getByRole("navigation", { name: "활동 기록 페이지" })).toHaveTextContent("1–20");
});
it("does not apply another month's page index to the selected month", () => {
  renderWithProviders(<App activities={records(41)} />, { route: `${base}&page=3&pageMonth=2026-08` });
  expect(rows()).toHaveLength(20);
  expect(screen.getByRole("navigation", { name: "활동 기록 페이지" })).toHaveTextContent("1–20");
});
