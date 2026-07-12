import { describe, expect, it } from "vitest";
import { ORGANIZER_BENEFITS } from "./EventOrganizerPage";

describe("EventOrganizerPage", () => {
  it("covers the three organizer conversion promises", () => {
    expect(ORGANIZER_BENEFITS).toEqual(["live", "results", "group"]);
  });
});
