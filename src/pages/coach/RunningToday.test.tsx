import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { fakeRun30Api, run30Program } from "../../__tests__/fixtures/run30";
import { RunningToday } from "./CoachTodayPage";
import type { Run30ProgramState } from "../../features/training/run30/useRun30Program";
function renderProgram(program: Run30ProgramState["program"]) {
  renderWithProviders(<RunningToday state={{ program, api: fakeRun30Api(), status: "ready", error: null, refresh: vi.fn(), retry: vi.fn() }} />);
}
describe("running today handoff", () => {
  it("shows app handoff only when the server says start", () => {
    renderProgram(run30Program({ todayAction: "start" }));
    expect(screen.getByRole("link", { name: "앱에서 시작" })).toHaveAttribute("href", "/ko/plan?sport=run");
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
