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

    fireEvent.click(screen.getByRole("button", { name: "Google 로그인" }));

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
    const value = { courses: [], loading: false, error: true, retry, search: () => [] };
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

  it("keeps a successful empty course list distinct from a read error", async () => {
    const spy = vi.spyOn(courseHook, "useCourses").mockReturnValue({ courses: [], loading: false, error: false, retry: vi.fn(), search: () => [] });
    try {
      renderWithProviders(<GoalSetupPage />, { authenticated: true, route: "/ko/goal-setup?sport=bike" });
      expect(await screen.findByText("등록된 코스가 없습니다")).toBeInTheDocument();
      expect(screen.queryByText("코스 목록을 불러오지 못했어요.")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "코스 다시 불러오기" })).not.toBeInTheDocument();
    } finally { spy.mockRestore(); }
  });


  it("keeps direct swimming setup read-only with an unavailable status instead of a wizard", async () => {
    const prior = mockCallableInvocations.length;
    renderWithProviders(<GoalSetupPage />, { authenticated: true, route: "/ko/goal-setup?sport=swim" });
    expect(await screen.findByText("수영 · 준비 중")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.queryByTestId("K3-3-2")).not.toBeInTheDocument();
    expect(mockCallableInvocations.slice(prior).filter(call => /createGoal|generatePlan/i.test(call.name))).toEqual([]);
  });

});
