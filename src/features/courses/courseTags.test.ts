import { describe, expect, it } from "vitest";
import { courseTagLabel, primaryCourseTags } from "./courseTags";

describe("course tags", () => {
  it("formats known tags and avoids exposing raw namespace prefixes for unknown tags", () => {
    expect(courseTagLabel("distance:ultra")).toBe("초장거리");
    expect(courseTagLabel("custom:river")).toBe("river");
  });

  it("hides internal start and duplicated region tags from primary display tags", () => {
    expect(primaryCourseTags({
      tags: ["start:wydks", "region:경기도", "distance:long", "segment:하오고개"],
      autoTags: [],
    })).toEqual(["distance:long", "segment:하오고개"]);
  });
});
