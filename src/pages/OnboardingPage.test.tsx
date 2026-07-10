import { screen, waitFor } from "@testing-library/react";
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
});
