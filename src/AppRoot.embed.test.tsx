import { act, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("./App", () => ({
  default: () => <div data-testid="app" />,
  isEmbeddedRoutePath: (pathname: string) => (
    /^\/[^/]+\/embed\/(?:activity\/[^/]+\/analysis|fitness|plan)\/?$/.test(pathname)
  ),
}));

vi.mock("./contexts/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="normal-auth-provider">{children}</div>
  ),
}));
vi.mock("./contexts/ThemeContext", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./contexts/ToastContext", () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./contexts/DialogContext", () => ({
  DialogProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./components/ImpersonationBanner", () => ({ default: () => null }));
vi.mock("./theme", () => ({
  OriderThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import AppRoot from "./AppRoot";

describe("AppRoot embedded provider boundary", () => {
  it.each([
    "/ko/embed/activity/activity-1/analysis",
    "/ko/embed/fitness?sport=run",
    "/ko/embed/plan?sport=swim",
  ])("removes the normal AuthProvider when SPA navigation enters %s", async (embeddedPath) => {
    const router = createMemoryRouter(
      [{ path: "*", element: <AppRoot /> }],
      { initialEntries: ["/ko/activity/activity-1"] },
    );
    render(<RouterProvider router={router} />);

    expect(screen.getByTestId("normal-auth-provider")).toBeInTheDocument();
    await act(async () => {
      await router.navigate(embeddedPath);
    });

    expect(screen.queryByTestId("normal-auth-provider")).not.toBeInTheDocument();
    expect(screen.getByTestId("app")).toBeInTheDocument();
  });
});
