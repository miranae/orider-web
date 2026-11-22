import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import MobilePlanPage from "./MobilePlanPage";

describe("MobilePlanPage 계획 관리", () => {
  it("관리 동작을 이번 주 머리의 ⋯ 아이콘 하나로 접고 목표 재설정·포기는 두지 않는다", () => {
    const actions = { onIcsExport: vi.fn(), onReroll: vi.fn() };
    renderWithProviders(<MobilePlanPage currentWeek={null} weekLabel="이번 주" goalTitle="목표 라이드" {...actions} />);
    expect(screen.queryByRole("button", { name: "계획 관리 →" })).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "계획 관리" });
    expect(trigger).toHaveClass("ds-btn--icon-only");
    expect(trigger).toHaveAttribute("title", "계획 관리");
    expect(document.querySelector(".mobile-plan-week-header")).toContainElement(trigger);
    const panel = document.getElementById(trigger.getAttribute("aria-controls")!)!;
    expect(panel).not.toBeVisible();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(within(panel).getAllByRole("button").map(item => item.textContent)).toEqual(["캘린더 내보내기", "재생성"]);
    expect(within(panel).queryByRole("button", { name: "목표 포기" })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "목표 재설정" })).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "재생성" }));
    expect(actions.onReroll).toHaveBeenCalledOnce();
    expect(panel).not.toBeVisible();
  });

  it("관리 동작이 없으면 ⋯ 도, 빈 계획 관리 줄도 그리지 않고 운동 계획 머리 줄도 없다", () => {
    renderWithProviders(<MobilePlanPage currentWeek={null} weekLabel="이번 주" goalTitle="목표 라이드" />);
    expect(screen.queryByRole("button", { name: "계획 관리" })).not.toBeInTheDocument();
    expect(screen.queryByText("운동 계획")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "계획 관리 →" })).not.toBeInTheDocument();
  });
});
