import { screen } from "@testing-library/react";
import MobileFeedPage from "./MobileFeedPage";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { createMockActivity } from "../../__tests__/fixtures/mockData";

vi.mock("../../services/analytics", () => ({ track: vi.fn() }));
vi.mock("../activity/ActivitySocialFooter", () => ({ default: () => null }));

const base = { loading: false, hasMore: false, loadingMore: false, onLoadMore: vi.fn() };

// 경고·빈 상태 문구 자체를 누르면 해소하는 곳으로 간다 — 버튼을 새로 덧붙이지 않는다.
describe("홈 피드 경고 문구를 누르면 해결로", () => {
  it("구독 준비 중 문구를 누르면 같은 주소의 다른 조건은 두고 전체 범위로 간다", () => {
    renderWithProviders(<MobileFeedPage {...base} activities={[]} feedScope="following" unavailableMessage="구독 기능을 준비하고 있어요. 다른 활동 범위를 이용해 주세요." />,
      { authenticated: true, route: "/ko/?scope=following&sport=bike" });
    const link = screen.getByRole("link", { name: /구독 기능을 준비하고 있어요/ });
    const href = new URL(link.getAttribute("href")!, "https://x.invalid");
    expect(href.pathname).toBe("/ko/");
    expect(href.searchParams.get("scope")).toBe("all");
    expect(href.searchParams.get("sport")).toBe("bike");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("조건에 맞는 활동 없음 설명을 누르면 종목·기간을 전체로 되돌린다", () => {
    renderWithProviders(<MobileFeedPage {...base} activities={[createMockActivity({ type: "ride" })]} feedScope="all" sportFilter="run" datePreset="30d" />,
      { authenticated: true, route: "/ko/?sport=run&date=30d&scope=friends" });
    const link = screen.getByRole("link", { name: "필터나 기간을 바꿔 다시 확인해 보세요." });
    const href = new URL(link.getAttribute("href")!, "https://x.invalid");
    expect(href.searchParams.get("sport")).toBe("all");
    expect(href.searchParams.get("date")).toBe("all");
    expect(href.searchParams.get("scope")).toBe("friends");
    expect(screen.queryByRole("button", { name: /필터 초기화/ })).toBeNull();
  });

  it("필터가 없는데 범위 때문에 비었으면 필터 설명은 글자로만 둔다", () => {
    renderWithProviders(<MobileFeedPage {...base} activities={[createMockActivity({ type: "ride", userId: "someone" })]} currentUserId="test-uid" feedScope="self" />,
      { authenticated: true, route: "/ko/" });
    expect(screen.getByText("필터나 기간을 바꿔 다시 확인해 보세요.").closest("a")).toBeNull();
  });

  it("「Strava를 연동하거나…」를 누르면 연결 화면으로 간다", () => {
    renderWithProviders(<MobileFeedPage {...base} activities={[]} feedScope="self" hasUnfilteredActivity={false} />, { authenticated: true, route: "/ko/" });
    expect(screen.getByRole("link", { name: "Strava를 연동하거나 라이딩을 기록해 보세요." }).getAttribute("href")).toBe("/ko/settings/connections");
  });
});
