import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StravaCallbackPage from "./StravaCallbackPage";

const mocks = vi.hoisted(() => ({
  exchangeCode: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "u1" } }),
}));

vi.mock("../hooks/useLocalizedNavigate", () => ({
  useLocalizedNavigate: () => mocks.navigate,
}));

vi.mock("../hooks/useStrava", () => ({
  useStrava: () => ({
    exchangeCode: (code: string) => mocks.exchangeCode(code),
  }),
}));

vi.mock("../services/analytics", () => ({
  track: vi.fn(),
}));

describe("StravaCallbackPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.exchangeCode.mockReset();
    mocks.navigate.mockReset();
    mocks.exchangeCode.mockResolvedValue({ athleteId: 1 });
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
});

