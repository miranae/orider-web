import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { fakeRun30Api, run30Program } from "../../__tests__/fixtures/run30";
import { RunningToday } from "./CoachTodayPage";
import type { Run30ProgramState } from "../../features/training/run30/useRun30Program";
function renderProgram(program: Run30ProgramState["program"]) {
  renderWithProviders(<RunningToday state={{ program, api: fakeRun30Api(), status: "ready", error: null, refresh: vi.fn(), retry: vi.fn() }} />);
}
describe("running today handoff", () => {
  it("offers the localized app handoff on an actionable day without invoking a web starter", () => {
    renderProgram(run30Program({ todayAction: "start" }));
    expect(screen.getByRole("link", { name: "앱에서 시작" })).toHaveAttribute("href", "/ko/plan?sport=run");
    expect(screen.getByText(/오늘 단계 정보/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "App Store" })).toBeInTheDocument();
  });
  it("uses the actual scheduled starter only with host capability and allowed health/expiry gate", async () => {
    const starter = { start: vi.fn(async () => ({ accepted: true as const })) };
    const program = run30Program({ todayAction: "start" });
    const state = { program, api: fakeRun30Api(), status: "ready" as const, error: null, refresh: vi.fn(), retry: vi.fn() };
    const { rerender } = renderWithProviders(<RunningToday state={state} startMode={{ kind: "host", starter }} />);
    expect(screen.queryByRole("button", { name: /시작/ })).not.toBeInTheDocument();
    rerender(<RunningToday state={state} startMode={{ kind: "host", starter }} allowStart />);
    fireEvent.click(screen.getByRole("button", { name: /시작/ }));
    await waitFor(() => expect(starter.start).toHaveBeenCalledWith(program.next!.scheduledSessionId));
  });
  it.each(["rest", "hold", "decide"] as const)("does not start a %s day", todayAction => {
    renderProgram(run30Program({ todayAction }));
    expect(screen.queryByRole("link", { name: "앱에서 시작" })).not.toBeInTheDocument();
  });
  it("does not start a finished program", () => {
    renderProgram({ ...run30Program(), next: null });
    expect(screen.queryByRole("link", { name: "앱에서 시작" })).not.toBeInTheDocument();
  });
  it("offers the plan when no program exists", () => {
    renderProgram(null);
    expect(screen.getByRole("link", { name: "프로그램 전체 보기" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "앱에서 시작" })).not.toBeInTheDocument();
  });
});
