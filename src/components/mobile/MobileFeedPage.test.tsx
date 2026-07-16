import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MobileFeedPage from "./MobileFeedPage";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { createMockActivity, createMockSummary } from "../../__tests__/fixtures/mockData";

vi.mock("../training/TodaysWorkoutCard", () => ({
  default: () => null,
}));

vi.mock("../RouteMap", () => ({
  default: ({ interactive }: { interactive?: boolean }) => (
    <div data-testid="route-map" data-interactive={String(interactive)}>Map</div>
  ),
}));

vi.mock("../activity/ActivitySocialFooter", () => ({
  default: () => null,
}));

describe("MobileFeedPage", () => {
  it("shows load more when the current filtered page is empty but more pages exist", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();

    renderWithProviders(
      <MobileFeedPage
        activities={[]}
        loading={false}
        hasMore
        loadingMore={false}
        onLoadMore={onLoadMore}
        feedScope="all"
        onFeedScopeChange={vi.fn()}
      />,
    );

    const loadMore = screen.getByRole("button", { name: "더 보기" });
    expect(loadMore).toBeInTheDocument();

    await user.click(loadMore);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("uses owner-only weekly stats for the summary while feed activities only drive filtering", async () => {
    const user = userEvent.setup();
    const bike = createMockActivity({
      id: "bike-activity",
      type: "ride",
      description: "한강 사이클",
      summary: createMockSummary({ distance: 42000 }),
    });
    const run = createMockActivity({
      id: "run-activity",
      type: "run",
      description: "공원 러닝",
      summary: createMockSummary({ distance: 10000 }),
    });

    renderWithProviders(
      <MobileFeedPage
        activities={[bike, run]}
        loading={false}
        hasMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
        weeklySummary={{
          activityCount: 3,
          distances: { bike: 12_400, run: 5_600, swim: 1_450 },
        }}
        feedScope="all"
        onFeedScopeChange={vi.fn()}
      />,
      { authenticated: true },
    );

    await screen.findByText("이번 주 요약");
    expect(screen.queryByText("주간 거리")).not.toBeInTheDocument();
    const sportFilters = await screen.findByRole("group", { name: "활동 종목 필터" });
    const buttons = within(sportFilters).getAllByRole("button");
    expect(buttons).toHaveLength(4);

    const allButton = within(sportFilters).getByRole("button", { name: "전체" });
    const runButton = within(sportFilters).getByRole("button", { name: "🏃 러닝" });
    expect(allButton).toHaveAttribute("aria-pressed", "true");
    expect(within(sportFilters).getByText("3건")).toBeInTheDocument();
    expect(within(sportFilters).getByText("12")).toBeInTheDocument();
    expect(within(sportFilters).getByText("6")).toBeInTheDocument();
    expect(within(sportFilters).getByText("1,450")).toBeInTheDocument();

    await user.click(runButton);

    expect(runButton).toHaveAttribute("aria-pressed", "true");
    expect(allButton).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("공원 러닝")).toBeInTheDocument();
    expect(screen.queryByText("한강 사이클")).not.toBeInTheDocument();
  });

  it("keeps the unified sport filters available to guests", async () => {
    const user = userEvent.setup();
    const bike = createMockActivity({
      id: "guest-bike",
      type: "ride",
      description: "게스트 사이클",
    });
    const swim = createMockActivity({
      id: "guest-swim",
      type: "swim",
      description: "게스트 수영",
    });

    renderWithProviders(
      <MobileFeedPage
        activities={[bike, swim]}
        loading={false}
        hasMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
        feedScope="all"
        onFeedScopeChange={vi.fn()}
      />,
    );

    const sportFilters = await screen.findByRole("group", { name: "활동 종목 필터" });
    expect(within(sportFilters).getAllByRole("button")).toHaveLength(4);

    await user.click(within(sportFilters).getByRole("button", { name: "🏊 수영" }));

    expect(screen.getByText("게스트 수영")).toBeInTheDocument();
    expect(screen.queryByText("게스트 사이클")).not.toBeInTheDocument();
  });

  it("re-renders legacy map thumbnails for authenticated viewers", async () => {
    const activity = createMockActivity({
      id: "legacy-thumbnail",
      mapImageUrl: "https://storage.googleapis.com/legacy/map.webp",
    });

    const { container } = renderWithProviders(
      <MobileFeedPage
        activities={[activity]}
        loading={false}
        hasMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
        feedScope="all"
        onFeedScopeChange={vi.fn()}
      />,
      { authenticated: true },
    );

    expect(await screen.findByTestId("route-map")).toHaveAttribute("data-interactive", "false");
    expect(container.querySelector(`img[src="${activity.mapImageUrl}"]`)).not.toBeInTheDocument();
  });

  it("keeps client-captured Firebase thumbnails on mobile", () => {
    const mapImageUrl = "https://firebasestorage.googleapis.com/v0/b/test/o/map.webp?alt=media";
    const activity = createMockActivity({ id: "current-thumbnail", mapImageUrl });

    const { container } = renderWithProviders(
      <MobileFeedPage
        activities={[activity]}
        loading={false}
        hasMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
        feedScope="all"
        onFeedScopeChange={vi.fn()}
      />,
      { authenticated: true },
    );

    expect(container.querySelector(`img[src="${mapImageUrl}"]`)).toBeInTheDocument();
    expect(screen.queryByTestId("route-map")).not.toBeInTheDocument();
  });

  it("filters the feed scope from the select beside the date range", async () => {
    const user = userEvent.setup();
    const onFeedScopeChange = vi.fn();
    const friendActivity = createMockActivity({
      id: "friend-activity",
      userId: "friend-1",
      description: "친구 활동",
    });
    const publicActivity = createMockActivity({
      id: "public-activity",
      userId: "public-1",
      description: "전체 활동",
    });

    const { rerender } = renderWithProviders(
      <MobileFeedPage
        activities={[friendActivity, publicActivity]}
        loading={false}
        hasMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
        friendIds={["friend-1"]}
        feedScope="all"
        onFeedScopeChange={onFeedScopeChange}
      />,
    );

    const scopeSelect = screen.getByRole("combobox", { name: "피드 범위" });
    const dateSelect = screen.getByRole("combobox", { name: "기간" });
    expect(scopeSelect.compareDocumentPosition(dateSelect) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.selectOptions(scopeSelect, "friends");

    expect(onFeedScopeChange).toHaveBeenCalledWith("friends");

    rerender(
      <MobileFeedPage
        activities={[friendActivity, publicActivity]}
        loading={false}
        hasMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
        friendIds={["friend-1"]}
        feedScope="friends"
        onFeedScopeChange={onFeedScopeChange}
      />,
    );

    expect(screen.getByText("친구 활동")).toBeInTheDocument();
    expect(screen.queryByText("전체 활동")).not.toBeInTheDocument();
  });
});
