import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MobileFeedPage from "./MobileFeedPage";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";

vi.mock("../training/TodaysWorkoutCard", () => ({
  default: () => null,
}));

vi.mock("../RouteMap", () => ({
  default: () => <div data-testid="route-map">Map</div>,
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
      />,
    );

    const loadMore = screen.getByRole("button", { name: "더 보기" });
    expect(loadMore).toBeInTheDocument();

    await user.click(loadMore);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
