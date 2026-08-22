import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("./components/Layout", () => ({
  default: () => (
    <div data-testid="general-layout">
      <Outlet />
    </div>
  ),
}));

vi.mock("./embedded/EmbeddedBootstrapRoot", () => ({
  default: () => <div data-testid="embedded-route" />,
}));

import { AppRoutes } from "./App";

describe("embedded activity analysis route", () => {
  it("renders outside the general Layout", async () => {
    render(
      <MemoryRouter initialEntries={["/ko/embed/activity/activity-1/analysis"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("embedded-route")).toBeInTheDocument();
    expect(screen.queryByTestId("general-layout")).not.toBeInTheDocument();
  });
});
