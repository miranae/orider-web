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
  default: ({ surfaceKind }: { surfaceKind: string }) => (
    <div data-testid="embedded-route" data-surface-kind={surfaceKind} />
  ),
}));

import { AppRoutes, isEmbeddedRoutePath } from "./App";

describe("embedded routes", () => {
  it.each([
    ["/ko/embed/activity/activity-1/analysis", "activity-analysis"],
    ["/ko/embed/activity/activity-1/public", "activity-public"],
    ["/ko/embed/fitness?sport=run", "fitness"],
    ["/en/embed/plan?sport=swim", "plan"],
    ["/ko/embed/event/event-1", "event-detail"],
    ["/en/embed/event/event-1/results", "event-detail"],
    ["/ko/embed/clubs", "clubs"],
    ["/ko/embed/clubs/club-1", "club-detail"],
    ["/en/embed/clubs/club-1/members", "club-detail"],
    ["/ko/embed/courses/course-1", "course-detail"],
    ["/en/embed/courses/course-1/", "course-detail"],
  ])("renders %s outside the general Layout", async (path, surfaceKind) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("embedded-route")).toHaveAttribute(
      "data-surface-kind",
      surfaceKind,
    );
    expect(screen.queryByTestId("general-layout")).not.toBeInTheDocument();
  });

  it.each([
    "/ko/embed/event/event-1",
    "/en/embed/event/event-1/host/participants",
    "/ko/embed/activity/activity-1/analysis",
    "/ko/embed/activity/activity-1/public",
    "/ko/embed/fitness",
    "/en/embed/plan/",
    "/ko/embed/courses/course-1",
  ])("recognizes embedded path %s", (path) => {
    expect(isEmbeddedRoutePath(path)).toBe(true);
  });

  it.each(["/ko/fitness", "/ko/plan", "/ko/embed/activity/activity-1"])(
    "does not recognize normal path %s",
    (path) => expect(isEmbeddedRoutePath(path)).toBe(false),
  );
});
