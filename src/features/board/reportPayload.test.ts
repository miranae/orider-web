import { describe, expect, it } from "vitest";
import { buildBoardReportPayload } from "./reportPayload";

describe("buildBoardReportPayload", () => {
  it("builds a structured comment report payload", () => {
    expect(buildBoardReportPayload({
      targetType: "comment",
      postId: "post-1",
      commentId: "comment-1",
      reason: "privacy",
      note: "  contains personal information  ",
      targetPreview: {
        title: "Ride post",
        authorNickname: "Rider",
        createdAt: 1783350000000,
      },
    })).toEqual({
      targetType: "comment",
      postId: "post-1",
      commentId: "comment-1",
      reason: "privacy",
      note: "contains personal information",
      targetPreview: {
        title: "Ride post",
        authorNickname: "Rider",
        createdAt: 1783350000000,
      },
    });
  });
});
