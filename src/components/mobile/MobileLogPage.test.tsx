import { useEffect } from "react";
import * as activityAcceptance from "../../utils/estimateTSS";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import i18n from "i18next";
import enTraining from "../../i18n/resources/en/training.json";
import { MemoryRouter, useNavigate, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import MobileLogPage from "./MobileLogPage";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useLocalizedNavigate", () => ({ useLocalizedNavigate: () => navigate }));
vi.mock("./ImportActivityModal", () => ({ default: () => null }));

function activity(id: string, day: number): Activity {
  return {
    id, type: "Ride", description: `Ride ${id}`,
    startTime: new Date(2026, 8, day, 9).getTime(),
    summary: { distance: 20000, ridingTimeMillis: 3600000, elevationGain: 100, tss: 60 },
  } as Activity;
}

function QueryNavigation() {
  const navigateQuery = useNavigate();
  const location = useLocation();
  return <><button onClick={() => navigateQuery("?sport=swim")}>Change query</button><output data-testid="query">{location.search}</output></>;
}

describe("MobileLogPage", () => {
  it("mounts the rolling summary only in the activity tab and keeps it mounted across month changes", () => {
    const read = vi.fn();
    function Summary() { useEffect(() => { read(); }, []); return <section>Recent rolling summary</section>; }
    const view = render(<MemoryRouter><MobileLogPage activities={[activity("bike", 2)]} year={2026} month={8} onChangeMonth={vi.fn()} recentSummarySlot={<Summary />} /></MemoryRouter>);
    expect(read).not.toHaveBeenCalled();
    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[1]!);
    expect(read).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Recent rolling summary")).toBeInTheDocument();
    view.rerender(<MemoryRouter><MobileLogPage activities={[activity("bike", 2)]} year={2026} month={7} onChangeMonth={vi.fn()} recentSummarySlot={<Summary />} /></MemoryRouter>);
    expect(read).toHaveBeenCalledTimes(1);
    fireEvent.click(tabs[0]!);
    expect(screen.queryByText("Recent rolling summary")).not.toBeInTheDocument();
  });
  it("honors incoming sport and later navigation without losing unrelated query parameters", () => {
    const run = { ...activity("run", 3), type: "Run", description: "Run only" };
    const swim = { ...activity("swim", 4), type: "Swim", description: "Swim only" };
    render(<MemoryRouter initialEntries={["/?sport=run&keep=1"]}><QueryNavigation /><MobileLogPage activities={[activity("bike", 2), run, swim]} year={2026} month={8} onChangeMonth={vi.fn()} /></MemoryRouter>);
    const sports = within(screen.getByRole("group"));
    expect(sports.getByRole("button", { name: /러닝/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "최근 활동" })).toHaveTextContent("Run only");
    expect(screen.getByRole("region", { name: "최근 활동" })).not.toHaveTextContent("Ride bike");
    fireEvent.click(sports.getByRole("button", { name: /사이클/ }));
    expect(screen.getByTestId("query")).toHaveTextContent("sport=bike&keep=1");
    fireEvent.click(screen.getByRole("button", { name: "Change query" }));
    expect(sports.queryByRole("button", { name: /수영/ })).not.toBeInTheDocument();
    expect(sports.getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "최근 활동" })).toHaveTextContent("Swim only");
    expect(screen.getByRole("region", { name: "최근 활동" })).toHaveTextContent("Run only");
  });

  it("falls back to all activities for an unsupported sport", () => {
    render(<MemoryRouter initialEntries={["/?sport=invalid"]}><MobileLogPage activities={[activity("bike", 2)]} year={2026} month={8} onChangeMonth={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "true");
  });

  it.each([["ko", "계획"], ["en", "Plan"]])("renders planned-day labels in %s without leaking a namespace key", async (language, label) => {
    i18n.addResourceBundle("en", "training", enTraining, true, true);
    await i18n.changeLanguage(language);
    try {
      render(<MemoryRouter><MobileLogPage activities={[]} plannedDates={["2026-09-03"]} plannedSports={{ "2026-09-03": "run" }} year={2026} month={8} onChangeMonth={vi.fn()} /></MemoryRouter>);
      expect(screen.getByTestId("P1-2-2")).toHaveTextContent(label);
      expect(screen.queryByText("log.planLabel")).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId("P1-2-2"));
      expect(navigate).toHaveBeenCalledWith("/coach/plan?sport=run&date=2026-09-03");
    } finally { await i18n.changeLanguage("ko"); }
  });

  it("shows recent rides before the compact monthly metrics and keeps full-list navigation", () => {
    const unnamedRide = activity("a", 3);
    unnamedRide.description = "";
    const view = render(<MemoryRouter><MobileLogPage activities={[unnamedRide, activity("b", 22)]} year={2026} month={8} onChangeMonth={vi.fn()} /></MemoryRouter>);
    const preview = screen.getByRole("region", { name: "최근 활동" });
    const glance = screen.getByLabelText("이번 달 운동 요약");
    expect(glance).toHaveTextContent("40.0km");
    expect(glance).toHaveTextContent("2");
    expect(within(glance).getByText("2h 0m")).toBeInTheDocument();
    expect(within(glance).getByText("120")).toBeInTheDocument();
    expect(screen.getAllByText("2h 0m")).toHaveLength(1);
    expect(screen.getAllByText("120")).toHaveLength(1);
    expect(within(preview).getByRole("button", { name: /Ride b/ })).toBeInTheDocument();
    expect(within(preview).getByRole("button", { name: /사이클/ })).toBeInTheDocument();
    expect(within(preview).getByRole("button", { name: /Ride b/ })).toHaveTextContent("20.0km");
    expect(preview.compareDocumentPosition(screen.getByText("활동 분포")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("활동횟수").parentElement).toHaveTextContent("2");
    fireEvent.click(within(preview).getByRole("button", { name: /Ride b/ }));
    expect(navigate).toHaveBeenCalledWith("/activity/b");
    fireEvent.click(within(preview).getByRole("button", { name: "전체 보기 →" }));
    expect(screen.getByRole("tab", { name: "활동" })).toHaveAttribute("aria-selected", "true");
    expect(view.container.querySelectorAll(".mobile-log__activity")).toHaveLength(2);
  });

  it("makes calendar days and URL-backed activity details keyboard-operable", async () => {
    const changeMonth = vi.fn();
    const estimatedRide = activity("b", 3);
    estimatedRide.summary.tss = null;
    // 같은 날짜의 별도 운동이다. 시작 시각을 분리해 중복 운동 대표 선택과 구분한다.
    estimatedRide.startTime += 2 * 60 * 60 * 1000;
    render(<MemoryRouter><MobileLogPage activities={[activity("a", 3), estimatedRide, activity("c", 22)]} year={2026} month={8} onChangeMonth={changeMonth} /></MemoryRouter>);
    expect(screen.getByLabelText("이번 달 운동 요약")).toHaveTextContent("추정 포함");
    const day = screen.getByRole("button", { name: "9월 3일 활동 2건" });
    day.focus();
    fireEvent.keyDown(day, { key: "Enter" });
    fireEvent.click(day);
    const sheet = screen.getByRole("dialog", { name: "2026-09-03 계획과 기록" });
    expect(within(sheet).getByRole("button", { name: /Ride a/ })).toBeVisible();
    const close = within(sheet).getByRole("button", { name: "← 뒤로" });
    expect(sheet.parentElement?.parentElement).toBe(document.body);
    expect(document.body.style.overflow).toBe("hidden");
    expect(close).toHaveFocus();
    expect(within(sheet).getByRole("button", { name: /Ride b/ })).toHaveTextContent("TSS 추정");
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(within(sheet).getByRole("button", { name: /Ride b/ })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(day).toHaveFocus();
    expect(document.body.style.overflow).not.toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "9월 22일 활동 1건" }));
    expect(navigate).toHaveBeenCalledWith("/activity/c");
    fireEvent.click(screen.getByRole("button", { name: "← 이전 달" }));
    expect(changeMonth).toHaveBeenCalledWith(-1);
  });
});

it("추가 대표의 정정된 날짜로 합계를 계산하고 원본 최근 목록은 보존한다", () => {
  const original = activity("fragment", 3);
  const representative = {...original, id: "canonical", source: "strava", summary: {...original.summary, distance: 42000}} as Activity;
  render(<MemoryRouter><MobileLogPage activities={[original]} representativeCandidates={[original, representative]} year={2026} month={8} onChangeMonth={vi.fn()} /></MemoryRouter>);
  expect(screen.getByLabelText("이번 달 운동 요약")).toHaveTextContent("42.0km");
  expect(screen.getByRole("region", {name: "최근 활동"})).toHaveTextContent("Ride fragment");
});

it("대표 확인 실패는 합계만 미확인으로 표시하고 원본 활동을 숨기지 않는다", () => {
  render(<MemoryRouter><MobileLogPage activities={[activity("fragment", 3)]} aggregateUnavailable year={2026} month={8} onChangeMonth={vi.fn()} /></MemoryRouter>);
  const glance = screen.getByLabelText("이번 달 운동 요약");
  expect(glance).not.toHaveTextContent("20.0km");
  expect(glance).toHaveTextContent("–");
  const preview = screen.getByRole("region", {name: "최근 활동"});
  expect(preview).toHaveTextContent("Ride fragment");
  fireEvent.click(within(preview).getByRole("button", {name: "전체 보기 →"}));
  expect(screen.getByRole("tab", {name: "활동"})).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("button", {name: /Ride fragment/})).toBeInTheDocument();
});


it("탭과 날짜 상세 상태 변경은 월 대표를 다시 계산하지 않는다", () => {
  const second = activity("memo-second", 3);
  second.startTime += 7200000;
  const rows = [activity("memo", 3), second];
  const representatives = vi.spyOn(activityAcceptance, "acceptedPhysicalActivities");
  try {
    render(<MemoryRouter><MobileLogPage activities={rows} year={2026} month={8} onChangeMonth={vi.fn()} /></MemoryRouter>);
    const calls = representatives.mock.calls.length;
    fireEvent.click(screen.getByRole("button", {name: "9월 3일 활동 2건"}));
    expect(representatives.mock.calls.length).toBe(calls);
    fireEvent.click(screen.getByRole("tab", {name: "활동"}));
    expect(representatives.mock.calls.length).toBe(calls);
    fireEvent.click(screen.getByRole("tab", {name: "월간"}));
    expect(representatives.mock.calls.length).toBe(calls);
  } finally { representatives.mockRestore(); }
});


it("keeps dense month records bounded by page and starts a changed month or sport at page one", () => {
  const rides = Array.from({ length: 41 }, (_, i) => activity(`dense-${i}`, 2));
  const runs = rides.map((a, i) => ({ ...a, id: `run-${i}`, type: "Run", description: `Run dense-${i}` }));
  const october = rides.map(a => ({ ...a, id: `oct-${a.id}`, description: `October ${a.id}`, startTime: new Date(2026, 9, 2, 9).getTime() }));
  const acts = [...rides, ...runs, ...october];
  const view = render(<MemoryRouter><MobileLogPage activities={acts} year={2026} month={8} onChangeMonth={vi.fn()} /></MemoryRouter>);
  fireEvent.click(screen.getAllByRole("tab")[1]!);
  expect(screen.getAllByText(/^(Ride|Run) dense-/)).toHaveLength(20);
  fireEvent.click(screen.getByRole("button", { name: "다음 기록" }));
  expect(screen.getAllByText(/^(Ride|Run) dense-/)).toHaveLength(20);
  fireEvent.click(screen.getByRole("button", { name: /러닝/ }));
  expect(screen.getAllByText(/^Run dense-/)).toHaveLength(20);
  view.rerender(<MemoryRouter><MobileLogPage activities={acts} year={2026} month={9} onChangeMonth={vi.fn()} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "전체" }));
  expect(screen.getAllByText(/^October dense-/)).toHaveLength(20);
  fireEvent.click(screen.getByRole("button", { name: "다음 기록" }));
  fireEvent.click(screen.getByRole("button", { name: "다음 기록" }));
  expect(screen.getAllByText(/^October dense-/)).toHaveLength(1);
  expect(screen.getByRole("button", { name: "다음 기록" })).toBeDisabled();
});
