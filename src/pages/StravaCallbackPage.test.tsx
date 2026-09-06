import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StravaCallbackPage from "./StravaCallbackPage";

const mocks = vi.hoisted(() => ({
  auth: { user: { uid: "u1" } as { uid: string } | null, loading: false },
  connectStrava: vi.fn(),
  exchangeCode: vi.fn(),
  navigate: vi.fn(),
  activityDocs: [] as Array<Record<string, unknown>>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((...args: unknown[]) => ({ kind: "collection", args })),
  where: vi.fn((...args: unknown[]) => ({ kind: "where", args })),
  orderBy: vi.fn((...args: unknown[]) => ({ kind: "orderBy", args })),
  limit: vi.fn((...args: unknown[]) => ({ kind: "limit", args })),
  query: vi.fn((...args: unknown[]) => ({ kind: "query", args })),
  getDocs: vi.fn(async () => ({
    docs: mocks.activityDocs.map((data, index) => ({
      id: String(data.id ?? `activity-${index}`),
      data: () => data,
    })),
  })),
}));

vi.mock("../services/firebase", () => ({
  firestore: {},
}));

vi.mock("../services/errorLogger", () => ({
  logClientError: vi.fn(),
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
    exchangeCode: (...args: [string, string?]) => mocks.exchangeCode(...args),
  }),
}));

vi.mock("../services/analytics", () => ({
  track: vi.fn(),
}));

describe("StravaCallbackPage", () => {
  it("forwards the scope returned by Strava when authorizing publishing", async () => {
    sessionStorage.setItem("strava_state", "nonce");
    render(<MemoryRouter initialEntries={["/strava/callback?code=write-code&state=nonce&scope=read,activity:read_all,activity:write"]}><StravaCallbackPage /></MemoryRouter>);
    await waitFor(() => expect(mocks.exchangeCode).toHaveBeenCalledWith("write-code", "read,activity:read_all,activity:write"));
  });
  beforeEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
    mocks.auth.user = { uid: "u1" };
    mocks.auth.loading = false;
    mocks.connectStrava.mockReset();
    mocks.exchangeCode.mockReset();
    mocks.navigate.mockReset();
    mocks.activityDocs = [
      {
        id: "a1",
        userId: "u1",
        source: "strava",
        createdAt: Date.now(),
        summary: { distance: 25_000, elevationGain: 450, tss: 42 },
      },
    ];
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

  it("keeps the user on a success summary instead of auto-redirecting", async () => {
    sessionStorage.setItem("strava_state", "nonce");
    sessionStorage.setItem("strava_return_to", "/onboarding?returnTo=%2Fplan");

    render(
      <MemoryRouter initialEntries={["/strava/callback?code=code-1&state=nonce"]}>
        <StravaCallbackPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("stravaCallback.summary.activities")).toBeInTheDocument();
    expect(screen.getByText("stravaCallback.summary.curveReady")).toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "stravaCallback.action.continue" }));

    expect(mocks.navigate).toHaveBeenCalledWith("/onboarding?returnTo=%2Fplan");
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
