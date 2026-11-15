import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import RelationshipManagementList from "./RelationshipManagementList";

vi.mock("../../services/activitySubscriptions", () => ({
  readOwnSubscriptionPage: vi.fn(async () => ({ items: [], cursor: null, hasMore: false })),
  readOwnBlockedPage: vi.fn(async () => ({ items: [], cursor: null, hasMore: false })),
  setActivitySubscription: vi.fn(), unblockActivitySubscriptionTarget: vi.fn(), isSubscriptionsNotDeployed: () => false,
}));

// 빈 목록 문구 자체를 누르면 해소하는 곳으로 — 버튼을 새로 두지 않는다.
describe("연결된 사용자 없음 문구", () => {
  it("내가 구독한 사람이 없으면 문구를 누르면 사람 찾기로 간다", async () => {
    renderWithProviders(<RelationshipManagementList uid="test-uid" view="subscriptions" />, { authenticated: true, route: "/ko/athlete/me/friends" });
    expect(await screen.findByRole("link", { name: "아직 연결된 사용자가 없습니다." })).toHaveAttribute("href", "/ko/explore/athletes");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it.each(["subscribers", "blocked"] as const)("%s 목록이 비면 글자로만 둔다(내가 채울 수 없다)", async view => {
    renderWithProviders(<RelationshipManagementList uid="test-uid" view={view} />, { authenticated: true });
    expect((await screen.findByText("아직 연결된 사용자가 없습니다.")).closest("a")).toBeNull();
  });
});
