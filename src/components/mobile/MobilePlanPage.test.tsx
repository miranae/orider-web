import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import MobilePlanPage from "./MobilePlanPage";

describe("MobilePlanPage 계획 관리", () => {
  it("관리 동작을 글자 버튼 줄 대신 목표 카드 머리의 ⋯ 아이콘 하나로 접는다", () => {
    const actions = { onIcsExport: vi.fn(), onReroll: vi.fn(), onGoalReset: vi.fn(), onAbandon: vi.fn() };
    renderWithProviders(<MobilePlanPage currentWeek={null} weekLabel="이번 주" goalTitle="목표 라이드" {...actions} />);
    expect(screen.queryByRole("button", { name: "계획 관리 →" })).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "계획 관리" });
    expect(trigger).toHaveClass("ds-btn--icon-only");
    expect(trigger).toHaveAttribute("title", "계획 관리");
    expect(screen.getByTestId("K4-2").querySelector(".mobile-plan-goal-top")).toContainElement(trigger);
    const panel = document.getElementById(trigger.getAttribute("aria-controls")!)!;
    expect(panel).not.toBeVisible();
    expect(screen.queryByRole("button", { name: "목표 포기" })).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(within(panel).getAllByRole("button").map(item => item.textContent)).toEqual(["캘린더 내보내기", "재생성", "목표 재설정", "목표 포기"]);
    fireEvent.click(within(panel).getByRole("button", { name: "재생성" }));
    expect(actions.onReroll).toHaveBeenCalledOnce();
    expect(panel).not.toBeVisible();
  });

  it("관리 동작이 없으면 ⋯ 도, 빈 계획 관리 줄도 그리지 않는다", () => {
    renderWithProviders(<MobilePlanPage currentWeek={null} weekLabel="이번 주" goalTitle="목표 라이드" />);
    expect(screen.queryByRole("button", { name: "계획 관리" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "계획 관리 →" })).not.toBeInTheDocument();
  });
});
