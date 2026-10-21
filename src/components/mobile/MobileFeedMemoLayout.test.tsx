import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { createMockActivity } from "../../__tests__/fixtures/mockData";
import { activityFeedSourceRevision } from "../../services/activityFeedContent";
import { CompactActivityCard } from "./MobileFeedPage";
import ActivityCard from "../ActivityCard";

it("keeps actual memo text while excluding saved AI analysis from feed cards", () => {
  const activity = createMockActivity({ source: "strava", aiSummaryPreview: "저장된 AI 분석", commentCount: 0, thumbnailTrack: "" });
  activity.feedContentV1 = { version: 1, sourceRevision: activityFeedSourceRevision(activity), revision: "current", memo: "작성자가 남긴 실제 메모", memoTruncated: false, photos: [], totalPhotoCount: 0 };
  renderWithProviders(<CompactActivityCard activity={activity} />);
  expect(screen.getByText("작성자가 남긴 실제 메모")).toBeVisible();
  expect(screen.queryByText("저장된 AI 분석")).not.toBeInTheDocument();
  expect(screen.queryByText("AI 분석")).not.toBeInTheDocument();
  expect(screen.queryByText("AI 요약")).not.toBeInTheDocument();
});
it("expands and collapses overflowing memo text and resets expansion for another activity", () => {
  const scroll = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(120);
  const client = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(54);
  try {
    const activity = createMockActivity({ source: "strava", commentCount: 0, thumbnailTrack: "" });
    const memo = "실제 메모의 첫 줄\n둘째 줄\n셋째 줄\n넷째 줄";
    const projection = (id: string) => ({ version: 1 as const, sourceRevision: activityFeedSourceRevision({ ...activity, id }), revision: "current", memo, memoTruncated: false, photos: [], totalPhotoCount: 0 });
    const view = renderWithProviders(<CompactActivityCard activity={{ ...activity, feedContentV1: projection(activity.id) }} />);
    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    expect(screen.getByRole("button", { name: "접기" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "접기" }));
    expect(screen.getByRole("button", { name: "더 보기" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    view.rerender(<CompactActivityCard activity={{ ...activity, id: "next", feedContentV1: projection("next") }} />);
    expect(screen.getByRole("button", { name: "더 보기" })).toHaveAttribute("aria-expanded", "false");
  } finally { scroll.mockRestore(); client.mockRestore(); }
});
it("excludes saved AI summary from legacy list cards too", () => {
  renderWithProviders(<ActivityCard activity={createMockActivity({ source: "strava", aiSummaryPreview: "목록에서 제외할 AI 분석", segmentEffortCount: 0, thumbnailTrack: "" })} />);
  expect(screen.queryByText("목록에서 제외할 AI 분석")).not.toBeInTheDocument();
  expect(screen.queryByText("AI 요약")).not.toBeInTheDocument();
});
