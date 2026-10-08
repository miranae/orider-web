import { describe, expect, it } from "vitest";
import { isIndoorActivity, isVirtualActivityType } from "./indoorActivity";

describe("isIndoorActivity", () => {
  it("treats trainer=true as indoor regardless of type", () => {
    expect(isIndoorActivity({ type: "Run", trainer: true })).toBe(true);
    expect(isIndoorActivity({ type: "Ride", trainer: true })).toBe(true);
    expect(isIndoorActivity({ type: null, trainer: true })).toBe(true);
  });

  it("treats virtual sport types as indoor even without trainer", () => {
    expect(isIndoorActivity({ type: "VirtualRide" })).toBe(true);
    expect(isIndoorActivity({ type: "VirtualRun", trainer: false })).toBe(true);
    expect(isIndoorActivity({ type: "virtualride", trainer: null })).toBe(true);
  });

  it("keeps outdoor activities outdoor when trainer is false or missing", () => {
    expect(isIndoorActivity({ type: "Run", trainer: false })).toBe(false);
    expect(isIndoorActivity({ type: "Ride" })).toBe(false);
    expect(isIndoorActivity({ type: "TrailRun" })).toBe(false);
    expect(isIndoorActivity({ type: "TrailRun", trainer: null })).toBe(false);
    expect(isIndoorActivity({})).toBe(false);
  });
});

describe("isVirtualActivityType", () => {
  it("detects Strava Virtual* sport types only", () => {
    expect(isVirtualActivityType("VirtualRun")).toBe(true);
    expect(isVirtualActivityType("Run")).toBe(false);
    expect(isVirtualActivityType(undefined)).toBe(false);
  });
});
