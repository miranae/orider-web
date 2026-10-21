import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Activity } from "@shared/types";
import { createMockActivity } from "../../../__tests__/fixtures/mockData";
import { withStoredSummary, STORED_ACTIVITY_SUMMARY } from "../../../__tests__/fixtures/activityDefaultSummary";
import { activityFeedSourceRevision } from "../../../services/activityFeedContent";
import ActivityDetailMemo from "./ActivityDetailMemo";

const withMemo = (activity: Activity, memo: string | null): Activity => ({ ...activity,
  feedContentV1: { version: 1, revision: "memo", sourceRevision: activityFeedSourceRevision(activity),
    memo, memoTruncated: false, totalPhotoCount: 0, photos: [] },
});

describe("activity detail stored memo", () => {
  it.each(["orider", "strava"] as const)("shows the stored %s summary for null or whitespace memo without changing the activity", source => {
    const activity = withMemo(withStoredSummary(createMockActivity({ id: "detail", source, userId: "another-rider", type: "Run" })), null);
    const snapshot = structuredClone(activity);
    const view = render(<ActivityDetailMemo activity={activity} />);
    expect(screen.getByTestId("activity-detail-memo").textContent).toBe(STORED_ACTIVITY_SUMMARY);
    expect(activity).toEqual(snapshot);
    view.rerender(<ActivityDetailMemo activity={withMemo(activity, " \n ")} />);
    expect(screen.getByTestId("activity-detail-memo").textContent).toBe(STORED_ACTIVITY_SUMMARY);
  });
  it("keeps a current authored memo ahead of the stored default", () => {
    const activity = withMemo(withStoredSummary(createMockActivity({ id: "manual", source: "strava" })), "내가 작성한 메모\n그대로 유지");
    render(<ActivityDetailMemo activity={activity} />);
    expect(screen.getByTestId("activity-detail-memo").textContent).toBe("내가 작성한 메모\n그대로 유지");
    expect(screen.queryByText(/저장된 활동 요약/)).not.toBeInTheDocument();
  });
  it("does not keep previous route/revision content while waiting for a new stored summary", () => {
    const activity = withMemo(withStoredSummary(createMockActivity({ id: "a", source: "strava" })), "이전 메모");
    const view = render(<ActivityDetailMemo activity={activity} />);
    expect(screen.getByText("이전 메모")).toBeVisible();
    const next = { ...activity, id: "b", contentRevision: 2 };
    view.rerender(<ActivityDetailMemo activity={next} />);
    expect(screen.queryByTestId("activity-detail-memo")).not.toBeInTheDocument();
    view.rerender(<ActivityDetailMemo activity={withStoredSummary(next)} />);
    expect(screen.getByTestId("activity-detail-memo").textContent).toBe(STORED_ACTIVITY_SUMMARY);
    expect(screen.queryByText("이전 메모")).not.toBeInTheDocument();
  });
  it.each(["pending", "processing", "failed"] as const)("hides %s optional summary data", state => {
    const activity = withStoredSummary(createMockActivity({ source: "strava", description: "활동 제목" }));
    render(<ActivityDetailMemo activity={{ ...activity, defaultSummaryV1: { ...activity.defaultSummaryV1!, state } }} />);
    expect(screen.queryByTestId("activity-detail-memo")).not.toBeInTheDocument();
    expect(screen.queryByText("활동 제목")).not.toBeInTheDocument();
  });
  it("omits unsupported, absent or empty defaults", () => {
    const activity = withStoredSummary(createMockActivity({ source: "apple_health" }));
    const view = render(<ActivityDetailMemo activity={activity} />);
    expect(screen.queryByTestId("activity-detail-memo")).not.toBeInTheDocument();
    view.rerender(<ActivityDetailMemo activity={createMockActivity({ source: "strava" })} />);
    expect(screen.queryByTestId("activity-detail-memo")).not.toBeInTheDocument();
    view.rerender(<ActivityDetailMemo activity={withStoredSummary({ ...activity, source: "strava" }, " \n ")} />);
    expect(screen.queryByTestId("activity-detail-memo")).not.toBeInTheDocument();
  });
});
