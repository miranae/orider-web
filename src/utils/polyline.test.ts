import { describe, expect, it } from "vitest";
import { decodeTrack } from "./polyline";

describe("decodeTrack", () => {
  it("parses a single Orider lat,lng point without falling through to encoded polyline", () => {
    expect(decodeTrack("37.5,127.0")).toEqual([[37.5, 127.0]]);
  });
});
