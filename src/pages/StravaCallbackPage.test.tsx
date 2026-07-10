import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StravaCallbackPage from "./StravaCallbackPage";

const mocks = vi.hoisted(() => ({
  auth: { user: { uid: "u1" } as { uid: string } | null, loading: false },
  connectStrava: vi.fn(),
  exchangeCode: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => mocks.auth,
}));

vi.mock("../hooks/useLocalizedNavigate", () => ({
  useLocalizedNavigate: () => mocks.navigate,
}));

vi.mock("../hooks/useStrava", () => ({
  useStrava: () => ({
    connectStrava: (returnTo: string) => mocks.connectStrava(returnTo),
    exchangeCode: (code: string) => mocks.exchangeCode(code),
  }),
}));

vi.mock("../services/analytics", () => ({
  track: vi.fn(),
}));

describe("StravaCallbackPage", () => {
  beforeEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
    mocks.auth.user = { uid: "u1" };
    mocks.auth.loading = false;
    mocks.connectStrava.mockReset();
    mocks.exchangeCode.mockReset();
    mocks.navigate.mockReset();
    mocks.exchangeCode.mockResolvedValue({ athleteId: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not flip to invalidRequest after state is removed during exchange rerenders", async () => {
    sessionStorage.setItem("strava_state", "nonce");

    render(
      <MemoryRouter initialEntries={["/strava/callback?code=code-1&state=nonce"]}>
        <StravaCallbackPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("stravaCallback.step.done")).toBeInTheDocument());
    expect(screen.queryByText("stravaCallback.error.invalidRequest")).not.toBeInTheDocument();
    expect(mocks.exchangeCode).toHaveBeenCalledTimes(1);
    expect(mocks.exchangeCode).toHaveBeenCalledWith("code-1");
    expect(sessionStorage.getItem("strava_state")).toBeNull();
  });

  it("stops waiting when auth session is not restored", async () => {
    vi.useFakeTimers();
    mocks.auth.user = null;
    mocks.auth.loading = false;
    sessionStorage.setItem("strava_state", "nonce");

    render(
      <MemoryRouter initialEntries={["/strava/callback?code=code-1&state=nonce"]}>
        <StravaCallbackPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("stravaCallback.step.verifying")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText("stravaCallback.error.sessionExpired")).toBeInTheDocument();
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
  });

  it("preserves returnTo when retrying after Strava denial", async () => {
    sessionStorage.setItem("strava_return_to", "/onboarding?returnTo=%2Fgroup%2Fabc");

    render(
      <MemoryRouter initialEntries={["/strava/callback?error=access_denied&state=nonce"]}>
        <StravaCallbackPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("stravaCallback.error.denied")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "stravaCallback.action.retry" }));

    expect(mocks.connectStrava).toHaveBeenCalledWith("/onboarding?returnTo=%2Fgroup%2Fabc");
  });

  it("offers a direct path to Strava connection settings on callback failure", async () => {
    render(
      <MemoryRouter initialEntries={["/strava/callback?error=access_denied&state=nonce"]}>
        <StravaCallbackPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "stravaCallback.action.settings" }));

    expect(mocks.navigate).toHaveBeenCalledWith("/settings?section=connections");
  });
});
