import { act, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { simulateLogin } from "../../__tests__/mocks/firebase";
import { getActivitySubscriptionSummary, readOwnFriendCount, readOwnSubscriptionPage, ACTIVITY_SUBSCRIPTIONS_CHANGED_EVENT } from "../../services/activitySubscriptions";
import ProfileSocialStats from "./ProfileSocialStats";
const flags = vi.hoisted(() => ({ enabled: true }));
vi.mock("../../config/activitySubscriptions", () => ({ get ACTIVITY_SUBSCRIPTIONS_ENABLED() { return flags.enabled; } }));
vi.mock("../../services/activitySubscriptions", () => ({ getActivitySubscriptionSummary: vi.fn(), readOwnFriendCount: vi.fn(), readOwnSubscriptionPage: vi.fn(),
  ACTIVITY_SUBSCRIPTIONS_CHANGED_EVENT: "orider:activity-subscriptions-changed", isSubscriptionsNotDeployed: (error: { code?: string }) => error?.code === "subscriptions/not-deployed" }));
beforeEach(() => {
  flags.enabled = true;
  vi.mocked(getActivitySubscriptionSummary).mockReset().mockResolvedValue({ targetUid: "test-uid", subscribed: false, subscriptionCount: 0, subscriberCount: 2 });
  vi.mocked(readOwnFriendCount).mockReset().mockResolvedValue(5);
  vi.mocked(readOwnSubscriptionPage).mockReset().mockResolvedValue({ items: [], cursor: null, hasMore: false });
});
it("does not show or query relationship numbers for a guest", () => {
  renderWithProviders(<ProfileSocialStats />);
  expect(screen.queryByRole("button", { name: /구독/ })).not.toBeInTheDocument();
  expect(getActivitySubscriptionSummary).not.toHaveBeenCalled(); expect(readOwnFriendCount).not.toHaveBeenCalled();
});
it("keeps real friends separate when the subscription feature is off", async () => {
  flags.enabled = false;
  renderWithProviders(<ProfileSocialStats />, { authenticated: true });
  expect(await screen.findByRole("link", { name: "친구 5" })).toHaveAttribute("href", "/ko/athlete/me/friends");
  expect(screen.queryByRole("button", { name: /구독/ })).not.toBeInTheDocument();
  expect(getActivitySubscriptionSummary).not.toHaveBeenCalled();
});
it("links distinct subscription and subscriber counts to the shared relationship tabs", async () => {
  renderWithProviders(<ProfileSocialStats />, { authenticated: true });
  expect(await screen.findByRole("link", { name: "구독자 2" })).toHaveAttribute("href", "/ko/athlete/me/friends?view=subscribers");
  expect(screen.getByRole("link", { name: "구독 중 0" })).toHaveAttribute("href", "/ko/athlete/me/friends?view=subscriptions");
  expect(screen.getByRole("link", { name: "친구 5" })).toHaveAttribute("href", "/ko/athlete/me/friends");
  expect(readOwnSubscriptionPage).not.toHaveBeenCalled();
});
it("shows unavailable instead of zero after a failed summary read", async () => {
  vi.mocked(getActivitySubscriptionSummary).mockRejectedValue(new Error("denied"));
  renderWithProviders(<ProfileSocialStats />, { authenticated: true });
  expect(await screen.findByText("관계를 불러오지 못했습니다.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "구독자 —" })).toBeDisabled();
});
it("does not invite an action or invent zero when the backend is not deployed", async () => {
  vi.mocked(getActivitySubscriptionSummary).mockRejectedValue({ code: "subscriptions/not-deployed" });
  renderWithProviders(<ProfileSocialStats />, { authenticated: true });
  expect(await screen.findByText("구독 기능 준비 중")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "구독자 —" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
});
it("masks the previous account's counts when the account changes", async () => {
  renderWithProviders(<ProfileSocialStats />, { authenticated: true });
  await screen.findByRole("link", { name: "구독자 2" });
  vi.mocked(getActivitySubscriptionSummary).mockImplementation(() => new Promise(() => {}));
  act(() => simulateLogin({ uid: "other" }));
  await waitFor(() => expect(screen.queryByRole("link", { name: "구독자 2" })).not.toBeInTheDocument());
});
it("refreshes counts after a mutation event for the current account", async () => {
  renderWithProviders(<ProfileSocialStats />, { authenticated: true });
  await screen.findByRole("link", { name: "구독자 2" });
  vi.mocked(getActivitySubscriptionSummary).mockResolvedValue({ targetUid: "test-uid", subscribed: false, subscriptionCount: 1, subscriberCount: 2 });
  act(() => window.dispatchEvent(new CustomEvent(ACTIVITY_SUBSCRIPTIONS_CHANGED_EVENT, { detail: { uid: "test-uid" } })));
  expect(await screen.findByRole("link", { name: "구독 중 1" })).toBeInTheDocument();
});
it("shows the canonical owner activity count", async () => {
  renderWithProviders(<ProfileSocialStats />, { authenticated: true, profile: { stats: { activityCount: 48, totalDistance: 0, totalRidingTime: 0, totalElevationGain: 0 } } });
  expect(await screen.findByRole("link", { name: /활동.*48/ })).toHaveAttribute("href", "/ko/athlete/me/activities");
});
it("does not replace a missing activity count with zero", async () => {
  renderWithProviders(<ProfileSocialStats />, { authenticated: true, profile: { stats: undefined } });
  expect(await screen.findByRole("link", { name: /활동.*—/ })).toBeInTheDocument();
});
