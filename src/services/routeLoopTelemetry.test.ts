import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  normalizeRouteForTelemetry,
  recordRouteRedirect,
  recordRouteVisit,
  resetRouteLoopTelemetryForTest,
} from "./routeLoopTelemetry";
import { track } from "./analytics";

vi.mock("./analytics", () => ({
  track: vi.fn(),
}));

describe("routeLoopTelemetry", () => {
  beforeEach(() => {
    resetRouteLoopTelemetryForTest();
    vi.mocked(track).mockReset();
  });

  it("normalizes route identifiers before sending telemetry", () => {
    expect(normalizeRouteForTelemetry("/ko/activity/strava_123")).toBe("/activity/:id");
    expect(normalizeRouteForTelemetry("/group/g1/ride/r1")).toBe("/group/:id/ride/r1");
  });

  it("tracks every redirect and emits a loop event after repeated redirects to the same route", () => {
    recordRouteRedirect({
      fromPath: "/settings",
      toPath: "/onboarding",
      reason: "onboarding_required",
      onboardingStep: "strava",
      now: 1_000,
    });
    recordRouteRedirect({
      fromPath: "/migrate",
      toPath: "/onboarding",
      reason: "onboarding_required",
      onboardingStep: "strava",
      now: 10_000,
    });
    recordRouteRedirect({
      fromPath: "/settings",
      toPath: "/onboarding",
      reason: "onboarding_required",
      onboardingStep: "strava",
      now: 20_000,
    });

    expect(track).toHaveBeenCalledTimes(4);
    expect(track).toHaveBeenNthCalledWith(1, "route_redirect", expect.objectContaining({
      from_path: "/settings",
      to_path: "/onboarding",
      reason: "onboarding_required",
    }));
    expect(track).toHaveBeenLastCalledWith("route_loop_detected", expect.objectContaining({
      route: "/onboarding",
      occurrences: 3,
      reason: "onboarding_required",
      onboarding_step: "strava",
      from_paths: "/settings,/migrate",
    }));
  });

  it("does not emit duplicate loop events during the cooldown window", () => {
    for (let i = 0; i < 4; i += 1) {
      recordRouteRedirect({
        fromPath: "/settings",
        toPath: "/onboarding",
        reason: "onboarding_required",
        onboardingStep: "strava",
        now: 1_000 + i * 1_000,
      });
    }

    const loopCalls = vi.mocked(track).mock.calls.filter(([name]) => name === "route_loop_detected");
    expect(loopCalls).toHaveLength(1);
  });

  it("does not throw when analytics tracking fails before navigation", () => {
    vi.mocked(track).mockImplementationOnce(() => {
      throw new Error("analytics unavailable");
    });

    expect(() => recordRouteRedirect({
      fromPath: "/settings",
      toPath: "/onboarding",
      reason: "onboarding_required",
      onboardingStep: "strava",
      now: 1_000,
    })).not.toThrow();

    expect(track).toHaveBeenCalledTimes(1);
  });

  it("detects repeated visits to the same normalized route outside redirect guards", () => {
    recordRouteVisit({
      path: "/ko/activity/strava_1",
      fromPath: "/ko",
      now: 1_000,
    });
    recordRouteVisit({
      path: "/en/activity/strava_2",
      fromPath: "/ko/settings",
      now: 10_000,
    });
    recordRouteVisit({
      path: "/ko/activity/strava_3",
      fromPath: "/ko/board/post-1",
      now: 20_000,
    });

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenLastCalledWith("route_loop_detected", expect.objectContaining({
      route: "/activity/:id",
      occurrences: 3,
      reason: "route_revisit",
      from_paths: "/,/settings,/board/:id",
    }));
  });
});
