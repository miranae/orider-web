import { screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import MeetingSchedule from "./MeetingSchedule";
import { calendarDays, groupCafeDates, meetingToday, shiftMonth } from "./cafeCalendar";
import type { CafeScheduleEntry, ClubCafeSchedule } from "@shared/clubCafeSchedule";
const entry = (id: string, dates: string[]): CafeScheduleEntry => ({id, dates, title:`라이딩 ${id}`, boardId:4, boardName:"번개라이딩", author:"rider", commentCount:9, url:`https://cafe.naver.com/clublara/${id}`, closed:false, cancelled:false});
const today = meetingToday();
const month = today.slice(0,7);
const first = `${month}-01`;
const schedule: ClubCafeSchedule = {source:"naver-cafe", cafeUrl:"https://cafe.naver.com/clublara",syncedAt:Date.now(),entries:[entry("1",[today]),entry("2",[`${shiftMonth(month,1)}-01`])], undatedCount:0,truncated:false};
describe("cafe ride schedule", () => {
  it("uses KST midnight and correct leap-year / year-transition cells", () => {
    expect(meetingToday(Date.parse("2026-10-26T15:00:00Z"))).toBe("2026-10-27");
    expect(calendarDays("2028-02").filter(Boolean)).toHaveLength(29);
    expect(calendarDays("2026-02").filter(Boolean)).toHaveLength(28);
    expect(calendarDays("2026-11")[0]).toBe("2026-11-01");
    expect(shiftMonth("2026-12",1)).toBe("2027-01");
    expect(shiftMonth("2026-01",-1)).toBe("2025-12");
  });
  it("shows repeated dates without duplicating a post on the same date", () => {
    expect(groupCafeDates([entry("1",[today,today,first])]).map(([date,items])=>[date,items.length])).toEqual([...new Set([first,today])].sort().map(date=>[date,1]));
  });
  it("switches from upcoming list to a selectable month, opens original cafe links and distinguishes comments", () => {
    renderWithProviders(<MeetingSchedule schedule={schedule} language="ko" />);
    expect(screen.getByRole("link",{name:"라이딩 1"})).toHaveAttribute("href","https://cafe.naver.com/clublara/1");
    expect(screen.getAllByText("rider · 댓글 9").length).toBe(2);
    expect(screen.queryByText(/9.*참석/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"달력",exact:true}));
    expect(screen.queryByRole("link",{name:"라이딩 2"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"다음 달"}));
    expect(screen.getAllByRole("link",{name:"라이딩 2"}).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button",{name:"오늘",exact:true}));
    expect(screen.getByRole("button",{current:"date"})).toHaveAttribute("aria-pressed","true");
    expect(screen.queryByRole("link",{name:"라이딩 2"})).not.toBeInTheDocument();
  });
  it("filters list and calendar by board style and commute titles without counting comments as riders", () => {
    const rides: ClubCafeSchedule = { ...schedule, entries: [
      entry("1", [today]),
      { ...entry("2", [today]), boardId: 10, boardName: "투어라이딩" },
      { ...entry("3", [today]), title: "퇴근 라이딩", boardId: 4 },
    ] };
    renderWithProviders(<MeetingSchedule schedule={rides} language="ko" />);
    fireEvent.click(screen.getByRole("button", { name: "투어", exact: true }));
    expect(screen.getByRole("link", { name: "라이딩 2" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "라이딩 1" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "달력", exact: true }));
    expect(screen.getAllByRole("link", { name: "라이딩 2" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "퇴근 라이딩" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "출퇴근", exact: true }));
    expect(screen.getAllByRole("link", { name: "퇴근 라이딩" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "라이딩 2" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "전체", exact: true }));
    expect(screen.getAllByRole("link", { name: "라이딩 1" }).length).toBeGreaterThan(0);
  });

});
