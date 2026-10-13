import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import { compareObservedRoutes } from "@shared/observed-route-comparison";
import { routeFixture } from "../../../services/activityRouteEvidence.fixture";
import { ObservedRouteComparisonPanel } from "./ObservedRouteComparisonPanel";
const mocks = vi.hoisted(() => ({ state: { enabled: true, state: "idle", result: null as any, compare: vi.fn() }, units: "metric", language: "ko" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, parameters?: Record<string, unknown>) => `${key}${parameters ? ` ${Object.values(parameters).join(" ")}` : ""}`, i18n: { language: mocks.language } }) }));
vi.mock("../../../contexts/LocaleContext", () => ({ useLocale: () => ({ units: mocks.units }) }));
vi.mock("../../../hooks/useObservedRouteComparison", () => ({ useObservedRouteComparison: () => mocks.state }));
const activity = (id: string) => ({ id, userId: "owner", type: "Run", startTime: 1000, summary: {} }) as Activity;
beforeEach(() => { mocks.state = { enabled: true, state: "idle", result: null, compare: vi.fn() }; mocks.units = "metric"; mocks.language = "ko"; });
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

it.each(["ko", "en"])("labels actual selected GPS source links with KST start times in %s", language => {
  mocks.language = language; mocks.state.state = "available"; mocks.state.result = compareObservedRoutes(routeFixture(), routeFixture("second"));
  const current = { ...activity("first"), startTime: Date.UTC(2026, 9, 6, 17, 30) }, previous = { ...activity("second"), startTime: Date.UTC(2026, 9, 6, 17, 10) };
  const view = render(<ObservedRouteComparisonPanel current={current} previous={previous} />);
  expect(screen.getByRole("link", { name: /observedRoute.current.*02:30:00/ })).toHaveAttribute("href", `/${language}/activity/first`);
  expect(screen.getByRole("link", { name: /observedRoute.previous.*02:10:00/ })).toHaveAttribute("href", `/${language}/activity/second`);
  expect(screen.getByRole("link", { name: /02:10:00/ })).toHaveTextContent(language === "ko" ? "2026. 10. 07." : "10/07/2026");
  expect(mocks.state.compare).not.toHaveBeenCalled();
  view.rerender(<ObservedRouteComparisonPanel current={{ ...current, startTime: NaN }} previous={previous} />);
  expect(screen.getByRole("link", { name: /observedRoute.current.*—/ })).toHaveAttribute("href", `/${language}/activity/first`);
  expect(mocks.state.compare).not.toHaveBeenCalled();
});
