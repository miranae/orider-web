import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import MobileLogPage from "./MobileLogPage";

vi.mock("../../hooks/useLocalizedNavigate", () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock("./ImportActivityModal", () => ({ default: ({ open }: { open: boolean }) => open ? <div data-testid="import-modal" /> : null }));

// 빈 상태 문구 자체를 누르면 같은 화면의 활동 가져오기 창이 열린다 — 버튼을 새로 두지 않는다.
describe("운동 기록 빈 상태 문구를 누르면 가져오기", () => {
  it("이번 달 활동이 없다는 문구를 누르면 가져오기 창을 연다", () => {
    render(<MemoryRouter initialEntries={["/ko/athlete/me/activities?view=activities"]}><MobileLogPage activities={[]} year={2026} month={8} onChangeMonth={vi.fn()} /></MemoryRouter>);
    const buttonsBefore = screen.getAllByRole("button").length;
    expect(screen.queryByTestId("import-modal")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "아직 활동 기록이 없어요" }));
    expect(screen.getByTestId("import-modal")).toBeInTheDocument();
    expect(screen.getAllByRole("button").length).toBe(buttonsBefore);
  });

  it("고른 날짜에 활동이 없다는 문구를 누르면 가져오기 창을 연다", () => {
    render(<MemoryRouter initialEntries={["/ko/athlete/me/activities?day=2026-09-03"]}><MobileLogPage activities={[]} year={2026} month={8} onChangeMonth={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /이 날짜에 현재 조회된 활동 기록이 없습니다/ }));
    expect(screen.getByTestId("import-modal")).toBeInTheDocument();
  });

  it("검색 결과가 없을 때는 가져오기로 보내지 않는다", () => {
    render(<MemoryRouter initialEntries={["/ko/athlete/me/activities?view=activities&q=nothing"]}><MobileLogPage activities={[]} year={2026} month={8} onChangeMonth={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "아직 활동 기록이 없어요" })).toBeNull();
  });
});
