import { describe, expect, it } from "vitest";
import { canonicalEventCapacityCounts, participantEventCapacityCounts, unknownEventCapacityCounts, UNKNOWN_CAPACITY_CATEGORY } from "./eventCapacityCounts";

const counters = { capacitySchemaVersion: 1, totalRegistered: 2,
  byCategory: { road: 1, [UNKNOWN_CAPACITY_CATEGORY]: 1 },
  byRsvp: { going: 0, maybe: 0, declined: 0, unresponded: 2 } };

describe("event RIDER capacity read model", () => {
  it("keeps the global total independent of configured categories and unknown-category riders", () => {
    expect(canonicalEventCapacityCounts(counters, ["road"])).toEqual({ total: 2, byCategory: { road: 1 }, source: "canonical" });
  });
  it("does not infer a zero for a missing configured category", () => {
    expect(canonicalEventCapacityCounts(counters, ["new"])).toMatchObject({ total: 2, byCategory: { new: null } });
  });
  it.each([NaN, Infinity, -1, 1.5, "2", Number.MAX_SAFE_INTEGER + 1])("rejects invalid total %s", totalRegistered => {
    expect(canonicalEventCapacityCounts({ ...counters, totalRegistered }, ["road"])).toBeNull();
  });
  it.each([
    { ...counters, capacitySchemaVersion: undefined },
    { ...counters, capacitySchemaVersion: 2 },
    { ...counters, byCategory: { road: 1 } },
    { ...counters, byCategory: { road: -1, other: 3 } },
    { ...counters, byCategory: [] },
    { ...counters, byRsvp: { going: 0, maybe: 0, declined: 0, unresponded: 1 } },
    { ...counters, byRsvp: {} },
  ])("rejects legacy, incomplete, or inconsistent counters", value => {
    expect(canonicalEventCapacityCounts(value, ["road"])).toBeNull();
  });
  it("mirrors server RIDER/status policy from complete authorized participant data", () => {
    const p = participantEventCapacityCounts(["road"], [
      { role: "LEADER", status: "REGISTERED", category: "road" },
      { role: "RIDER", status: "REGISTERED", category: "road" },
      { role: "RIDER", status: "FINISHED" },
      { role: "RIDER" },
      ...["CANCELLED", "refunded", "WITHDRAWN", "WAITLISTED"].map(status => ({ role: "RIDER", status })),
      { role: "VIEWER", status: "REGISTERED" },
    ]);
    expect(p).toEqual({ total: 3, byCategory: { road: 1, [UNKNOWN_CAPACITY_CATEGORY]: 2 }, source: "participants" });
  });
  it("preserves unknown rather than fabricating zero from an unavailable projection", () => {
    expect(unknownEventCapacityCounts(["road"])).toEqual({ total: null, byCategory: { road: null }, source: "unknown" });
    expect(participantEventCapacityCounts(["road"], [])).toEqual({ total: 0, byCategory: { road: 0 }, source: "participants" });
  });
});
