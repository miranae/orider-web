import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

describe("MobileLogPage", () => {
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
    expect(within(preview).getByRole("button", { name: /Ride b/ })).toBeInTheDocument();
    expect(within(preview).getByRole("button", { name: /사이클/ })).toBeInTheDocument();
    expect(within(preview).getByRole("button", { name: /Ride b/ })).toHaveTextContent("20.0km");
    expect(preview.compareDocumentPosition(screen.getByText("월간 요약")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("총 세션").parentElement).toHaveTextContent("2");
    fireEvent.click(within(preview).getByRole("button", { name: /Ride b/ }));
    expect(navigate).toHaveBeenCalledWith("/activity/b");
    fireEvent.click(within(preview).getByRole("button", { name: "전체 보기 →" }));
    expect(screen.getByRole("tab", { name: "활동" })).toHaveAttribute("aria-selected", "true");
    expect(view.container.querySelectorAll(".mobile-log__activity")).toHaveLength(2);
  });

  it("makes calendar days and multi-activity sheet keyboard-operable", () => {
    const changeMonth = vi.fn();
    const estimatedRide = activity("b", 3);
    estimatedRide.summary.tss = null;
    render(<MemoryRouter><MobileLogPage activities={[activity("a", 3), estimatedRide, activity("c", 22)]} year={2026} month={8} onChangeMonth={changeMonth} /></MemoryRouter>);
    expect(screen.getByLabelText("이번 달 운동 요약")).toHaveTextContent("추정 포함");
    const day = screen.getByRole("button", { name: "9월 3일 활동 2건" });
    day.focus();
    fireEvent.keyDown(day, { key: "Enter" });
    fireEvent.click(day);
    const sheet = screen.getByRole("dialog", { name: "9월 3일 활동 2건" });
    const firstActivity = within(sheet).getByRole("button", { name: /Ride a/ });
    const close = within(sheet).getByRole("button", { name: "닫기" });
    expect(firstActivity).toHaveFocus();
    expect(within(sheet).getByRole("button", { name: /Ride b/ })).toHaveTextContent("TSS 추정");
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(close).toHaveFocus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(firstActivity).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(day).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "9월 22일 활동 1건" }));
    expect(navigate).toHaveBeenCalledWith("/activity/c");
    fireEvent.click(screen.getByRole("button", { name: "← 이전 달" }));
    expect(changeMonth).toHaveBeenCalledWith(-1);
  });
});
