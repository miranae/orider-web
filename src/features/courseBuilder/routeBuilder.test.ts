import { describe, expect, it } from "vitest";
import { addWaypoint, MAX_BUILDER_WAYPOINTS, tryAddWaypoint, undoWaypoint } from "./routeBuilder";
describe("route builder state", () => {
  it("adds and undoes immutable waypoints", () => { const a = [{ lat: 1, lng: 2 }]; expect(addWaypoint(a, { lat: 3, lng: 4 })).toHaveLength(2); expect(undoWaypoint(a)).toEqual([]); });
  it("caps and rejects invalid points", () => { const full = Array.from({ length: MAX_BUILDER_WAYPOINTS }, () => ({ lat: 1, lng: 2 })); expect(addWaypoint(full, { lat: 2, lng: 3 })).toBe(full); expect(addWaypoint([], { lat: 91, lng: 0 })).toEqual([]); });
  it("atomically reports rejected clicks without replacing state", () => { const route = [{ lat: 1, lng: 2 }]; expect(tryAddWaypoint(route, { lat: Infinity, lng: 0 })).toEqual({ points: route, changed: false }); });
});
