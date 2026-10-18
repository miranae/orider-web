import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockUpdateDoc } from "../__tests__/mocks/firebase";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import OnboardingPage from "./OnboardingPage";

const mocks = vi.hoisted(() => ({ connectStrava: vi.fn() }));
vi.mock("../hooks/useStrava", () => ({ useStrava: () => ({ connectStrava: mocks.connectStrava }) }));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="handoff-location">{location.pathname}{location.search}{location.hash}</output>;
}

function renderGoal(returnTo = "/group/abc?tab=rides#today") {
  return renderWithProviders(<><OnboardingPage /><LocationProbe /></>, {
    authenticated: true,
    route: `/ko/onboarding?${new URLSearchParams({ returnTo })}`,
    profile: { onboardingStep: "goal", primaryDiscipline: "run" },
  });
}

describe("onboarding completion handoffs", () => {
  beforeEach(() => {
    mockUpdateDoc.mockReset().mockResolvedValue(undefined);
    mocks.connectStrava.mockReset();
  });

  it("persists done before navigating to friend invitations", async () => {
    let finishWrite!: () => void;
    mockUpdateDoc.mockImplementationOnce(() => new Promise<void>(resolve => { finishWrite = resolve; }));
    renderGoal();
    fireEvent.click(await screen.findByRole("button", { name: "친구 초대하고 시작" }));
    expect(mockUpdateDoc).toHaveBeenCalledWith(expect.objectContaining({ path: "users/test-uid" }), { onboardingStep: "done" });
    expect(screen.getByTestId("handoff-location")).toHaveTextContent("/ko/onboarding?");
    await act(async () => { finishWrite(); });
    await waitFor(() => expect(screen.getByTestId("handoff-location")).toHaveTextContent("/ko/athlete/me/friends?source=onboarding&returnTo=%2Fgroup%2Fabc%3Ftab%3Drides%23today"));
  });

  it("keeps the ordinary goal setup source, selected sport and original return destination", async () => {
    renderGoal();
    await userEvent.setup().click(await screen.findByRole("button", { name: "목표 설정하기" }));
    await waitFor(() => expect(screen.getByTestId("handoff-location")).toHaveTextContent("/ko/goal-setup?source=onboarding&sport=run&returnTo=%2Fgroup%2Fabc%3Ftab%3Drides%23today"));
    expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), { onboardingStep: "done" });
    expect(mocks.connectStrava).not.toHaveBeenCalled();
  });

  it("finishes skip at the original destination without starting goal setup or Strava", async () => {
    renderGoal();
    await userEvent.setup().click(await screen.findByRole("button", { name: "나중에" }));
    await waitFor(() => expect(screen.getByTestId("handoff-location")).toHaveTextContent("/ko/group/abc?tab=rides#today"));
    expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), { onboardingStep: "done" });
    expect(mocks.connectStrava).not.toHaveBeenCalled();
  });
});
