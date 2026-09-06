import { describe, expect, it } from "vitest";

import type { HostBridgeEnvelope } from "./bridge";
import { parseSurfaceSelectionMessage } from "./surfaceSelection";

function selectionMessage(
  payload: unknown,
  requestId?: string,
): HostBridgeEnvelope {
  return {
    version: 1,
    type: "host.surfaceSelected",
    payload,
    requestId,
  };
}

describe("parseSurfaceSelectionMessage", () => {
  it.each(["fitness", "plan", null] as const)("accepts strict surface selection %s", (surface) => {
    expect(parseSurfaceSelectionMessage(selectionMessage({ surface }, "selection-1"))).toEqual({
      surface,
      requestId: "selection-1",
    });
  });

  it.each([
    {},
    { surface: "activity-analysis" },
    { surface: "fitness", sport: "bike" },
    { surface: "fitness", extra: true },
    [],
    null,
  ])("rejects malformed or extended payload %#", (payload) => {
    expect(parseSurfaceSelectionMessage(selectionMessage(payload))).toBeNull();
  });

  it("rejects missing and oversized request ids", () => {
    expect(parseSurfaceSelectionMessage(selectionMessage({ surface: "fitness" }, ""))).toBeNull();
    expect(parseSurfaceSelectionMessage(selectionMessage({ surface: "fitness" }, "   "))).toBeNull();
    expect(parseSurfaceSelectionMessage(selectionMessage({ surface: "fitness" }, "x".repeat(129))))
      .toBeNull();
  });
});
