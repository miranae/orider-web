import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import { compareObservedRoutes } from "@shared/observed-route-comparison";
import { routeFixture } from "../../../services/activityRouteEvidence.fixture";
import { ObservedRouteComparisonPanel } from "./ObservedRouteComparisonPanel";
const mocks = vi.hoisted(() => ({ state: { enabled: true, state: "idle", result: null as any, compare: vi.fn() }, units: "metric" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, parameters?: Record<string, unknown>) => `${key}${parameters ? ` ${Object.values(parameters).join(" ")}` : ""}`, i18n: { language: "ko" } }) }));
vi.mock("../../../contexts/LocaleContext", () => ({ useLocale: () => ({ units: mocks.units }) }));
vi.mock("../../../hooks/useObservedRouteComparison", () => ({ useObservedRouteComparison: () => mocks.state }));
const activity = (id: string) => ({ id, userId: "owner", type: "Run", startTime: 1000, summary: {} }) as Activity;
beforeEach(() => { mocks.state = { enabled: true, state: "idle", result: null, compare: vi.fn() }; mocks.units = "metric"; });
describe("observed route comparison presentation", () => {
  it("starts only on manual click and renders unknown/gaps without course-certainty copy", () => {
    const current = activity("first"), previous = activity("second");
    const view = render(<ObservedRouteComparisonPanel current={current} previous={previous} />);
    expect(mocks.state.compare).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button")); expect(mocks.state.compare).toHaveBeenCalledTimes(1);
    mocks.state.state = "available"; mocks.state.result = compareObservedRoutes(routeFixture(), routeFixture("second"));
    view.rerender(<ObservedRouteComparisonPanel current={current} previous={previous} />);
    expect(screen.getByText("observedRoute.guidance.observed_shapes_close")).toBeInTheDocument();
    expect(screen.getByText("observedRoute.partial")).toBeInTheDocument(); expect(screen.getAllByText("0.0 m")).toHaveLength(2);
    expect(view.container.textContent).not.toContain("observed-route-comparison-v1"); expect(view.container.textContent).not.toContain("a".repeat(64));
    expect(screen.getAllByRole("link")).toHaveLength(2);
    mocks.units = "imperial"; view.rerender(<ObservedRouteComparisonPanel current={current} previous={previous} />);
    expect(screen.getAllByText("0.0 ft")).toHaveLength(2);
  });
  it("does not replace other metrics with a map or fake comparison when GPS is unavailable", () => {
    mocks.state.state = "unavailable";
    render(<ObservedRouteComparisonPanel current={activity("first")} previous={activity("second")} />);
    expect(screen.getByRole("status")).toHaveTextContent("observedRoute.states.unavailable"); expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
