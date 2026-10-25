import { afterEach, describe, expect, it, vi } from "vitest";
import { track } from "./analytics";
import { startJourneyMeasurement } from "./journeyMeasurement";
vi.mock("./analytics", () => ({ track: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
describe("journey measurements", () => {
  it("records each attempt once with only fixed dimensions and monotonic duration", () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(10).mockReturnValueOnce(52.6);
    const finish = startJourneyMeasurement("social_action_result", "web_public_activity", "comment");
    finish("error"); finish("success");
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("social_action_result", { surface: "web_public_activity", operation: "comment", outcome: "error", durationMs: 43 });
  });
  it("retains cancellations in the denominator and isolates telemetry failures", () => {
    vi.mocked(track).mockImplementation(() => { throw new Error("unavailable"); });
    const finish = startJourneyMeasurement("activity_detail_ready", "embedded_public_activity", "detail");
    expect(() => finish("cancelled")).not.toThrow();
    expect(track).toHaveBeenCalledWith("activity_detail_ready", expect.objectContaining({ outcome: "cancelled" }));
  });
});
