import { describe, expect, it, vi } from "vitest";
import { routeFixture } from "../services/activityRouteEvidence.fixture";
import { compareObservedRoutes } from "@shared/observed-route-comparison";
describe("route Worker dispatch uses the unchanged shared kernel", () => {
  it("returns exactly the pure result and echoes request identity", async () => {
    const host = { onmessage: null as any, postMessage: vi.fn() }; vi.stubGlobal("self", host);
    await import("./observedRouteComparison.worker");
    const routes = [routeFixture(), routeFixture("second", true)];
    host.onmessage({ data: { requestId: 7, routes } });
    expect(host.postMessage).toHaveBeenCalledExactlyOnceWith({ requestId: 7, result: compareObservedRoutes(routes[0]!, routes[1]!) });
    expect(host.postMessage.mock.calls[0]![0].result.direction).toBe("reverse");
  });
});
