import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockUpdateDoc } from "../__tests__/mocks/firebase";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import OnboardingPage from "./OnboardingPage";

const connectStrava = vi.fn();

vi.mock("../hooks/useStrava", () => ({
  useStrava: () => ({ connectStrava }),
}));

describe("OnboardingPage", () => {
  it("shows the signed-out guard without onboarding actions", () => {
    renderWithProviders(<OnboardingPage />, { authenticated: false, route: "/ko/onboarding" });
    expect(screen.getByText("로그인이 필요합니다")).toBeInTheDocument();
    expect(screen.queryByText("친구 초대하고 시작")).not.toBeInTheDocument();
  });
  it("resumes from the saved onboarding step instead of restarting", async () => {
    renderWithProviders(<OnboardingPage />, {
      route: "/ko/onboarding?returnTo=%2Fgroup%2Fabc",
      authenticated: true,
      profile: { onboardingStep: "goal", primaryDiscipline: "run" },
    });

    expect(await screen.findByText("운동 목표 설정")).toBeInTheDocument();
    expect(screen.queryByText("주 종목을 선택하세요")).not.toBeInTheDocument();
  });

  it("returns Strava users to onboarding with the original deep link preserved", async () => {
    mockUpdateDoc.mockClear();
    connectStrava.mockClear();
    const user = userEvent.setup();

    renderWithProviders(<OnboardingPage />, {
      route: "/ko/onboarding?returnTo=%2Fgroup%2Fabc",
      authenticated: true,
      profile: { onboardingStep: "strava", primaryDiscipline: "bike" },
    });

    await user.click(await screen.findByRole("button", { name: "Strava 연결하기" }));

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: "users/test-uid" }),
        { onboardingStep: "goal" },
      );
    });
    expect(connectStrava).toHaveBeenCalledWith("/onboarding?returnTo=%2Fgroup%2Fabc");
  });

  it("offers an escape hatch from the first step", async () => {
    mockUpdateDoc.mockClear();
    const user = userEvent.setup();

    renderWithProviders(<OnboardingPage />, {
      route: "/ko/onboarding?returnTo=%2Fgroup%2Fabc",
      authenticated: true,
      profile: { onboardingStep: "discipline" },
    });

    await user.click(await screen.findByRole("button", { name: "나중에" }));

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: "users/test-uid" }),
        { onboardingStep: "done" },
      );
    });
  });

  it("does not navigate when completion persistence fails", async () => {
    mockUpdateDoc.mockClear();
    mockUpdateDoc.mockRejectedValueOnce(new Error("firestore unavailable"));
    const user = userEvent.setup();
    renderWithProviders(<OnboardingPage />, {
      route: "/ko/onboarding?returnTo=%2Fplan",
      authenticated: true,
      profile: { onboardingStep: "goal" },
    });
    await user.click(await screen.findByRole("button", { name: "친구 초대하고 시작" }));
    expect(await screen.findByText("저장에 실패했습니다. 다시 시도해주세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "친구 초대하고 시작" })).toBeInTheDocument();
  });

  it("guards completion handlers against double action", async () => {
    mockUpdateDoc.mockClear();
    let resolve!: () => void;
    mockUpdateDoc.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }));
    renderWithProviders(<OnboardingPage />, {
      route: "/ko/onboarding?returnTo=%2Fplan",
      authenticated: true,
      profile: { onboardingStep: "goal" },
    });
    const button = await screen.findByRole("button", { name: "친구 초대하고 시작" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    resolve();
  });
});
