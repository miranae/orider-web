import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { mockSignInWithPopup } from "../__tests__/mocks/firebase";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import GoalSetupPage from "./GoalSetupPage";

describe("GoalSetupPage", () => {
  beforeEach(() => {
    mockSignInWithPopup.mockClear();
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
});
