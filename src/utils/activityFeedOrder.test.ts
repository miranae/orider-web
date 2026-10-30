import { describe, expect, it } from "vitest";
import { compareActivityFeedOrder } from "./activityFeedOrder";

describe("activity feed order", () => {
  it("prioritizes ride time then UTF-8 document names, independent of locale/provider", () => {
    const ids = ["a", "Z", "aa", "한", "\ue000", "😀"];
    const rows = ids.map(id => ({ id, startTime: 1 }));
    expect([{ id: "new", startTime: 2 }, ...rows].reverse().sort(compareActivityFeedOrder).map(row => row.id))
      .toEqual(["new", "😀", "\ue000", "한", "aa", "a", "Z"]);
    expect(compareActivityFeedOrder(rows[0], rows[0])).toBe(0);
  });
});
