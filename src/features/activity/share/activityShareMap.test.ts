import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildActivityShareMapUrl } from "./activityShareMap";

vi.mock("../../../utils/mapbox", () => ({ getMapboxToken: vi.fn(() => "public-map-token") }));

describe("buildActivityShareMapUrl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requests a retina map fitted to the original activity route", () => {
    const url = buildActivityShareMapUrl("37.50,127.00;37.51,127.02;37.53,127.04");

    expect(url).toContain("/static/path-6+FC5200-0.95(");
    expect(url).toContain("/auto/1080x600@2x");
    expect(url).toContain("padding=64");
    expect(url).toContain("access_token=public-map-token");
  });

  it("does not request a map without a usable route", () => {
    expect(buildActivityShareMapUrl("")).toBeNull();
    expect(buildActivityShareMapUrl("37.5,127.0")).toBeNull();
  });
});
