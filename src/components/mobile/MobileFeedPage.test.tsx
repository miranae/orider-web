import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MobileFeedPage from "./MobileFeedPage";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { createMockActivity, createMockSummary } from "../../__tests__/fixtures/mockData";

vi.mock("../training/TodaysWorkoutCard", () => ({
  default: () => null,
}));

vi.mock("../RouteMap", () => ({
  default: () => <div data-testid="route-map">Map</div>,
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
        recentWeeks={[]}
        feedScope="all"
        onFeedScopeChange={vi.fn()}
      />,
    );

    const loadMore = screen.getByRole("button", { name: "더 보기" });
    expect(loadMore).toBeInTheDocument();

    await user.click(loadMore);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("uses the weekly summary labels as the single sport filter row", async () => {
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
        recentWeeks={[]}
        feedScope="all"
        onFeedScopeChange={vi.fn()}
      />,
      { authenticated: true },
    );

    await screen.findByText("이번 주 요약");
    const sportFilters = await screen.findByRole("group", { name: "활동 종목 필터" });
    const buttons = within(sportFilters).getAllByRole("button");
    expect(buttons).toHaveLength(4);

    const allButton = within(sportFilters).getByRole("button", { name: "전체" });
    const runButton = within(sportFilters).getByRole("button", { name: "🏃 러닝" });
    expect(allButton).toHaveAttribute("aria-pressed", "true");
    expect(within(sportFilters).getByText("2건")).toBeInTheDocument();

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
        recentWeeks={[]}
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
        recentWeeks={[]}
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
        recentWeeks={[]}
        friendIds={["friend-1"]}
        feedScope="friends"
        onFeedScopeChange={onFeedScopeChange}
      />,
    );

    expect(screen.getByText("친구 활동")).toBeInTheDocument();
    expect(screen.queryByText("전체 활동")).not.toBeInTheDocument();
  });
});
