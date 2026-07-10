import { describe, expect, it } from "vitest";
import { isEventHost } from "./eventHost";

describe("isEventHost", () => {
  it("treats the creator as host even when they are not a participant leader", () => {
    expect(isEventHost("creator-1", { creatorId: "creator-1", hostIds: [] }, null)).toBe(true);
  });

  it("treats explicit hostIds as hosts", () => {
    expect(isEventHost("host-1", { creatorId: "creator-1", hostIds: ["host-1"] }, null)).toBe(true);
  });

  it("keeps participant LEADER role as a compatibility fallback", () => {
    expect(isEventHost("leader-1", { creatorId: "creator-1", hostIds: [] }, "LEADER")).toBe(true);
  });

  it("rejects signed-out and unrelated users", () => {
    expect(isEventHost(null, { creatorId: "creator-1", hostIds: ["host-1"] }, "LEADER")).toBe(false);
    expect(isEventHost("viewer-1", { creatorId: "creator-1", hostIds: ["host-1"] }, "RIDER")).toBe(false);
  });
});
