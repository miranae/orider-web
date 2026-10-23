import userEvent from "@testing-library/user-event";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockCallableInvocations, mockSignInWithPopup } from "../__tests__/mocks/firebase";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import * as courseHook from "../hooks/useCourses";
import GoalSetupPage from "./GoalSetupPage";

describe("GoalSetupPage", () => {
  beforeEach(() => {
    mockSignInWithPopup.mockClear();
  });

  it.each(["tri", "cycling"])("renders a usable bike wizard for legacy sport %s", async sport => {
    renderWithProviders(<GoalSetupPage />, { authenticated: true, route: `/ko/goal-setup?sport=${sport}` });
    expect(await screen.findByRole("heading", { name: "3분 안에 나만의 운동 계획 만들기" })).toBeInTheDocument();
    expect(screen.getByTestId("K3-3-2")).toBeInTheDocument();
  });

  it("requires sign-in before showing the bike goal wizard", async () => {
    renderWithProviders(<GoalSetupPage />, {
      authenticated: false,
      route: "/goal-setup",
    });

    expect(await screen.findByText("로그인 후 운동 목표를 만들 수 있습니다")).toBeInTheDocument();
    expect(screen.getByText("코스와 목표 시간을 입력하기 전에 먼저 로그인해 주세요. 로그인하면 목표 저장과 주간 계획 생성까지 이어집니다.")).toBeInTheDocument();
    expect(screen.queryByText("STEP")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    fireEvent.click(await screen.findByTestId("A1-1-1"));

    expect(mockSignInWithPopup).toHaveBeenCalledTimes(1);
  });

  it("requires sign-in before showing the run goal wizard", async () => {
    renderWithProviders(<GoalSetupPage />, {
      authenticated: false,
      route: "/goal-setup?sport=run",
    });

    expect(await screen.findByText("로그인 후 운동 목표를 만들 수 있습니다")).toBeInTheDocument();
    expect(screen.queryByText("이벤트 선택")).not.toBeInTheDocument();
  });

  it("shows a course read failure with its exact retry callback instead of the empty state", async () => {
    const retry = vi.fn();
    const value = { courses: [], items: [], loading: false, loadingMore: false, hasMore: false, loadMore: vi.fn(), error: true, retry, search: () => [] };
    const spy = vi.spyOn(courseHook, "useCourses").mockReturnValue(value);
    try {
      const view = renderWithProviders(<GoalSetupPage />, { authenticated: true, route: "/ko/goal-setup?sport=bike" });
      expect(await screen.findByText("코스 목록을 불러오지 못했어요.")).toBeInTheDocument();
      expect(screen.queryByText("등록된 코스가 없습니다")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "코스 다시 불러오기" }));
      expect(retry).toHaveBeenCalledExactlyOnceWith();
      spy.mockReturnValue({ ...value, error: false });
      view.rerender(<GoalSetupPage />);
      expect(screen.queryByText("코스 목록을 불러오지 못했어요.")).not.toBeInTheDocument();
      expect(screen.getByText("등록된 코스가 없습니다")).toBeInTheDocument();
    } finally { spy.mockRestore(); }
  });

  it("skips the invisible previous action in the first step keyboard order", async () => {
    const spy = vi.spyOn(courseHook, "useCourses").mockReturnValue({ courses: [], items: [], loading: false, loadingMore: false, hasMore: false, loadMore: vi.fn(), error: false, retry: vi.fn(), search: () => [] });
    try {
      renderWithProviders(<GoalSetupPage />, { authenticated: true, route: "/ko/goal-setup?sport=bike" });
      const create = await screen.findByRole("link", { name: /코스 만들기/ });
      const previous = screen.getByText("← 이전").closest("button")!;
      create.focus();
      await userEvent.tab();
      expect(previous).not.toHaveFocus();
      expect(previous).toBeDisabled();
      expect(screen.queryByRole("button", { name: "← 이전" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "다음 →" })).toBeDisabled();
      expect(mockCallableInvocations.filter(call => /createGoal|generatePlan/i.test(call.name))).toEqual([]);
    } finally { spy.mockRestore(); }
  });

  it("keeps a successful empty course list distinct from a read error", async () => {
    const spy = vi.spyOn(courseHook, "useCourses").mockReturnValue({ courses: [], items: [], loading: false, loadingMore: false, hasMore: false, loadMore: vi.fn(), error: false, retry: vi.fn(), search: () => [] });
    try {
      renderWithProviders(<GoalSetupPage />, { authenticated: true, route: "/ko/goal-setup?sport=bike" });
      expect(await screen.findByText("등록된 코스가 없습니다")).toBeInTheDocument();
      expect(screen.queryByText("코스 목록을 불러오지 못했어요.")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "코스 다시 불러오기" })).not.toBeInTheDocument();
    } finally { spy.mockRestore(); }
  });


  it("normalizes direct swimming setup to the bike wizard without saving a goal", async () => {
    const prior = mockCallableInvocations.length;
    renderWithProviders(<GoalSetupPage />, { authenticated: true, route: "/ko/goal-setup?sport=swim" });
    expect(await screen.findByRole("heading", { name: "3분 안에 나만의 운동 계획 만들기" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /수영/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("K3-3-2")).toBeInTheDocument();
    expect(mockCallableInvocations.slice(prior).filter(call => /createGoal|generatePlan/i.test(call.name))).toEqual([]);
  });

});
